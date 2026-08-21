import { currentTeacher, unauthorized } from "@/lib/auth";
import { listRecentlyDeletedStudents, restoreStudent } from "@/lib/db";

/** الطلاب المحذوفون خلال آخر ٢٤ ساعة — لعرض شريط "تراجع" */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return Response.json({ deleted: await listRecentlyDeletedStudents(teacher.id) });
}

/** يسترجع طالباً محذوفاً خلال المهلة */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = String(body.id ?? "").trim();
  if (!id) return Response.json({ error: "معرّف الطالب مفقود" }, { status: 400 });

  if (!(await restoreStudent(teacher.id, id))) {
    return Response.json({ error: "انتهت مهلة الاسترجاع أو الطالب غير موجود" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
