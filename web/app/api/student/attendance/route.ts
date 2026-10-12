import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { getAttendanceSummaries } from "@/lib/attendance-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/** ملخّص حضور الطالب نفسه فقط (آخر ٣٠ يوماً) — الهوية من جلسته لا من أي معامل */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const summaries = await getAttendanceSummaries(student.teacherId, riyadhTodayISO(), student.id);
  return Response.json({ summary: summaries[student.id] ?? null });
}
