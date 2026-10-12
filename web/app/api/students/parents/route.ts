import { currentTeacher, unauthorized } from "@/lib/auth";
import { listHalaqahStudentParents, unlinkParentFromStudent } from "@/lib/parent-db";

/** "ab***@gmail.com" — يكفي المشرف ليميّز الولي دون كشف بريده كاملاً */
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  return `${local.slice(0, 2)}***@${domain}`;
}

/** أولياء أمور طلاب حلقة المعلّم مجمّعين بمعرّف الطالب (الاسم وبريد مقنَّع)، مع هل يملك فكّ الربط */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const grouped = await listHalaqahStudentParents(teacher.halaqahId);
  const parents: Record<string, { parentId: number; name: string; email: string }[]> = {};
  for (const [studentId, list] of Object.entries(grouped)) {
    parents[studentId] = list.map((p) => ({ parentId: p.parentId, name: p.name, email: maskEmail(p.email) }));
  }
  return Response.json({ parents, canUnlink: teacher.role === "supervisor" });
}

/** فكّ ربط ولي بطالب — لمشرف الحلقة فقط، ومحصور بحلقته */
export async function DELETE(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.role !== "supervisor") {
    return Response.json({ error: "فكّ الربط لمشرف الحلقة فقط" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const studentId = String(body.studentId ?? "").trim();
  const parentId = Number(body.parentId);
  if (!studentId || !Number.isInteger(parentId)) {
    return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const removed = await unlinkParentFromStudent(teacher.halaqahId, studentId, parentId);
  if (!removed) return Response.json({ error: "الربط غير موجود" }, { status: 404 });
  return Response.json({ ok: true });
}
