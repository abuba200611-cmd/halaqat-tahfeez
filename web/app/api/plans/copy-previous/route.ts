import { currentTeacher, unauthorized } from "@/lib/auth";
import { hijriMonthOfISO, isValidMonthKey, shiftMonthKey } from "@/lib/hijri";
import { copyPreviousPlans } from "@/lib/plan-db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * "نسخ خطة الشهر الماضي للجميع": body = { month? } (الافتراضي الشهر الحالي).
 * يملأ الطلاب بلا خطة فقط — لا يستبدل أي خطة قائمة.
 */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`plans:${teacher.id}`, 300, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const month = body.month ?? hijriMonthOfISO(riyadhTodayISO());
  if (!isValidMonthKey(month)) return Response.json({ error: "شهر غير صحيح" }, { status: 400 });
  const previous = shiftMonthKey(month, -1);
  if (!previous) return Response.json({ error: "شهر غير صحيح" }, { status: 400 });

  const copied = await copyPreviousPlans(teacher.halaqahId, teacher.id, previous, month);
  return Response.json({ ok: true, copied });
}
