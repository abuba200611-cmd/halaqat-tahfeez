import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { listAllWardLogsForStudent } from "@/lib/db";
import { buildMonthlySummaries } from "@/lib/monthly-report";

/** السجلّ الشهري للطالب نفسه (STEP 53) — تجميع من كامل تاريخه، لا آخر ٣٠ ورداً فقط */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const wards = await listAllWardLogsForStudent(student.teacherId, student.id);
  return Response.json({ months: buildMonthlySummaries(wards) });
}
