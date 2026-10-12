import { currentTeacher, unauthorized } from "@/lib/auth";
import { getAttendanceSummaries } from "@/lib/attendance-db";
import { getCase, getRecentWards, listCaseActions, updateCaseFields } from "@/lib/case-db";
import { parseCaseId, parseFieldsBody } from "@/lib/case-study";
import { hijriMonthOfISO } from "@/lib/hijri";
import { getStudentPlanView } from "@/lib/plan-db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/* STEP 65 — حالة واحدة. حالة حلقة أخرى أو معرّف غير صالح = 404 دائماً. */

const bad = (error: string, status = 400) => Response.json({ error }, { status });
type Ctx = { params: Promise<{ id: string }> };

/** الحالة + الإجراءات + سياق مصغَّر (حضور ٣٠ يوماً، تقدّم الخطة، آخر ٥ أوراد) */
export async function GET(_request: Request, { params }: Ctx) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const caseId = parseCaseId((await params).id);
  if (caseId === null) return bad("غير موجود", 404);
  const found = await getCase(teacher.halaqahId, caseId);
  if (!found) return bad("غير موجود", 404);

  const today = riyadhTodayISO();
  const [actions, attendance, plan, wards] = await Promise.all([
    listCaseActions(teacher.halaqahId, caseId),
    getAttendanceSummaries(teacher.halaqahId, today, found.studentId),
    getStudentPlanView(teacher.halaqahId, found.studentId, hijriMonthOfISO(today), today),
    getRecentWards(teacher.halaqahId, found.studentId, 5),
  ]);

  return Response.json({
    case: found,
    actions,
    today,
    context: { attendance: attendance[found.studentId] ?? null, plan, wards },
  });
}

/** يحفظ حقول الدراسة (تشخيص/قوة/ضعف/خطة، ≤ ٢٠٠٠ حرف لكلٍّ) */
export async function PATCH(request: Request, { params }: Ctx) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`cases-edit:${teacher.id}`, 600, 3600))) return rateLimited();

  const caseId = parseCaseId((await params).id);
  if (caseId === null) return bad("غير موجود", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseFieldsBody(body);
  if (!parsed.ok) return bad(parsed.error);

  if (!(await updateCaseFields(teacher.halaqahId, caseId, parsed.fields))) return bad("غير موجود", 404);
  return Response.json({ ok: true });
}
