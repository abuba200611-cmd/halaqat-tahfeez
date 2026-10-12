import { currentTeacher, unauthorized } from "@/lib/auth";
import { getAttendanceSummaries } from "@/lib/attendance-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/** ملخّص آخر ٣٠ يوماً لكل طلاب حلقة المعلّم (مفتاحه معرّف الطالب) — لصفحة الطلاب */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return Response.json({ summaries: await getAttendanceSummaries(teacher.halaqahId, riyadhTodayISO()) });
}
