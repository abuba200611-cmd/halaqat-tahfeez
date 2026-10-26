import { currentTeacher, unauthorized } from "@/lib/auth";
import { listStudentsWithTodayWard } from "@/lib/db";
import { getHalaqahStage } from "@/lib/halaqah-stage-db";
import { profileFor } from "@/lib/halaqah-stage";
import { canTeacherRecord } from "@/lib/ward-policy";
import { formatWardByUnit } from "@/lib/ward-units";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * قائمة طلاب حلقة المعلّم مع حالة ورد اليوم (001 US2): لشاشة «تسجيل
 * الورد» المتتابعة — شارة «سُجِّل اليوم» وترتيب القائمة نفسه. للابتدائي
 * فقط، ولا يُرجَع إلا الاسم والحالة: لا هاتف ولا ولي أمر ولا معرّفات
 * داخلية أخرى (الدستور II — خصوصية القاصرين).
 */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const stage = await getHalaqahStage(teacher.halaqahId);
  const profile = profileFor(stage);
  if (!canTeacherRecord(profile)) {
    return Response.json(
      { code: "STAGE_NOT_PRIMARY", error: "تسجيل الورد عن الطالب متاح لحلقات الابتدائي فقط" },
      { status: 403 },
    );
  }

  const date = riyadhTodayISO();
  const students = await listStudentsWithTodayWard(teacher.halaqahId, date);
  return Response.json({
    stage,
    date,
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      recordedToday: s.todayWard !== null,
      lastSummary: s.todayWard
        ? (formatWardByUnit(profile.unit, s.todayWard.hifz, s.todayWard.hifzAyah) ?? null)
        : null,
    })),
  });
}
