import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { hijriMonthOfISO } from "@/lib/hijri";
import { getStudentPlanView } from "@/lib/plan-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/** خطة الطالب نفسه للشهر الهجري الحالي مع إنجازه — الهوية من جلسته لا من أي معامل */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const today = riyadhTodayISO();
  const view = await getStudentPlanView(student.teacherId, student.id, hijriMonthOfISO(today), today);
  return Response.json({ plan: view });
}
