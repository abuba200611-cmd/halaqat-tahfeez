import { currentTeacher, unauthorized } from "@/lib/auth";
import { hijriMonthOfISO, hijriMonthRange, isValidMonthKey, monthLabel, shiftMonthKey } from "@/lib/hijri";
import { EMPTY_ACTUAL, parsePlanBody, summarizePlan } from "@/lib/monthly-plan";
import { getMonthActuals, listHalaqahPlans, upsertPlan } from "@/lib/plan-db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/*
  STEP 63 — الخطة الشهرية لمعلّمي الحلقة (المشرف والمساعدون بصلاحية
  متطابقة). الحلقة تُؤخذ من الجلسة فقط — لا يقبل أي مسار معرّف حلقة من العميل.
*/

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** خطط شهر هجري (الافتراضي الشهر الحالي) لطلاب الحلقة الفعّالين مع الإنجاز الفعلي والحالة */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const today = riyadhTodayISO();
  const currentMonth = hijriMonthOfISO(today);
  const month = new URL(request.url).searchParams.get("month") ?? currentMonth;
  if (!isValidMonthKey(month)) return bad("شهر غير صحيح");

  const range = hijriMonthRange(month);
  const [students, actuals] = await Promise.all([
    listHalaqahPlans(teacher.halaqahId, month),
    getMonthActuals(teacher.halaqahId, range.start, range.end),
  ]);

  const rows = students.map((s) => {
    const actual = actuals[s.studentId] ?? EMPTY_ACTUAL;
    return { studentId: s.studentId, name: s.name, plan: s.plan, actual, progress: summarizePlan(s.plan, actual, range, today) };
  });

  return Response.json({
    month,
    monthLabel: monthLabel(month),
    currentMonth,
    prevMonth: shiftMonthKey(month, -1),
    nextMonth: shiftMonthKey(month, 1),
    start: range.start,
    end: range.end,
    today,
    rows,
  });
}

/** يحفظ/يحدّث خطة طالب واحد لشهر */
export async function PUT(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`plans:${teacher.id}`, 300, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parsePlanBody(body);
  if (!parsed.ok) return bad(parsed.error);

  const found = await upsertPlan(teacher.halaqahId, teacher.id, parsed.studentId, parsed.month, parsed.targets);
  if (!found) return bad("طالب غير موجود", 404);
  return Response.json({ ok: true });
}
