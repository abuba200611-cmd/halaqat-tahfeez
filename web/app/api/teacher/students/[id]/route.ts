import { currentTeacher, unauthorized } from "@/lib/auth";
import { listAllWardLogsForStudent, listStudents } from "@/lib/db";
import { computeJuzProgress } from "@/lib/juz-progress";
import { countReviewTrackPages } from "@/lib/review-tracks";
import { reviewTrackConfigForHalaqah } from "@/lib/mosque/review-tracks-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * B3 — صفحة طالب واحد عند المعلّم: التقدّم بالأجزاء وعدّادات المسارات
 * من تاريخ أوراده الكامل. الطالب من حلقة المعلّم نفسها فقط — طالب حلقة
 * أخرى أو معرّف غير معروف = 404 متطابقاً، فلا يكشف أي شيء.
 */
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const studentId = (await params).id;
  const students = await listStudents(teacher.halaqahId);
  const student = students.find((s) => s.id === studentId);
  if (!student) return Response.json({ error: "غير موجود" }, { status: 404 });

  const logs = await listAllWardLogsForStudent(teacher.halaqahId, studentId);
  const today = riyadhTodayISO();

  return Response.json({
    student: { id: student.id, name: student.name, group: student.group },
    progress: computeJuzProgress(logs.map((l) => l.hifz)),
    trackCounts: {
      days7: countReviewTrackPages(logs, 7, today),
      days30: countReviewTrackPages(logs, 30, today),
    },
    reviewTrackConfig: await reviewTrackConfigForHalaqah(teacher.halaqahId),
    wards: logs.slice(0, 30),
  });
}
