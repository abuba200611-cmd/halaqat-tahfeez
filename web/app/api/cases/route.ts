import { currentTeacher, unauthorized } from "@/lib/auth";
import { getAttendanceSummaries } from "@/lib/attendance-db";
import { getLastWardDates, listCases, openCase } from "@/lib/case-db";
import { parseOpenBody, suggestCandidates, type SuggestionInput } from "@/lib/case-study";
import { hijriMonthOfISO, hijriMonthRange } from "@/lib/hijri";
import { EMPTY_ACTUAL, summarizePlan } from "@/lib/monthly-plan";
import { getMonthActuals, listHalaqahPlans } from "@/lib/plan-db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/*
  STEP 65 — دراسة الحالة. خاصة بمعلّمي الحلقة (المشرف والمساعدون): جلسة الطالب
  وولي الأمر لا تُنتج currentTeacher فترجع 401. الحلقة من الجلسة فقط.
*/

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** حالات الحلقة + الطلاب المرشَّحون تلقائياً (لا حالة مفتوحة لهم) */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const today = riyadhTodayISO();
  const month = hijriMonthOfISO(today);
  const range = hijriMonthRange(month);
  const [cases, plans, actuals, attendance, lastWards] = await Promise.all([
    listCases(teacher.halaqahId),
    listHalaqahPlans(teacher.halaqahId, month),
    getMonthActuals(teacher.halaqahId, range.start, range.end),
    getAttendanceSummaries(teacher.halaqahId, today),
    getLastWardDates(teacher.halaqahId),
  ]);

  const inputs: SuggestionInput[] = plans.map((p) => ({
    studentId: p.studentId,
    name: p.name,
    planStatus: summarizePlan(p.plan, actuals[p.studentId] ?? EMPTY_ACTUAL, range, today).status,
    attendance: attendance[p.studentId] ?? null,
    lastWardDate: lastWards[p.studentId] ?? null,
  }));
  const openIds = cases.filter((c) => c.status === "open").map((c) => c.studentId);

  return Response.json({ today, cases, suggestions: suggestCandidates(inputs, openIds, today) });
}

/** يفتح حالة لطالب: 404 لطالب غير موجود/محذوف/من حلقة أخرى، 409 لو له حالة مفتوحة */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`cases:${teacher.id}`, 300, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseOpenBody(body);
  if (!parsed.ok) return bad(parsed.error);

  const result = await openCase(teacher.halaqahId, parsed.studentId, teacher.id);
  if (result.kind === "not_found") return bad("طالب غير موجود", 404);
  if (result.kind === "exists") {
    return Response.json({ error: "للطالب حالة مفتوحة بالفعل", caseId: result.id }, { status: 409 });
  }
  return Response.json({ ok: true, id: result.id }, { status: 201 });
}
