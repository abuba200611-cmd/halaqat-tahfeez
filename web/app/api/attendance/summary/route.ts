import { currentTeacher, unauthorized } from "@/lib/auth";
import { getAttendanceSummaries } from "@/lib/attendance-db";
import { wardsDailyFor } from "@/lib/dashboard-charts-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * ملخّص آخر ٣٠ يوماً لكل طلاب حلقة المعلّم (مفتاحه معرّف الطالب) — لصفحة
 * الطلاب. wardsDaily (مواصفة 003) حقلاً إضافياً: أوراد الحلقة يومياً
 * بالسلسلة نفسها التي ترسمها اللوحات الأخرى.
 */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const today = riyadhTodayISO();
  const [summaries, wardsDaily] = await Promise.all([
    getAttendanceSummaries(teacher.halaqahId, today),
    wardsDailyFor(teacher.halaqahId, today),
  ]);
  return Response.json({ summaries, wardsDaily });
}
