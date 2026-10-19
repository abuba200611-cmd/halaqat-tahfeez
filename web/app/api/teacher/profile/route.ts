import { currentTeacher, unauthorized } from "@/lib/auth";
import { updateTeacherName } from "@/lib/db";
import { handleNameChange } from "@/lib/name-change";

/** تعديل اسم المعلّم — المعرّف من الجلسة حصراً، والجسم `{ name }` فقط */
export async function PATCH(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return handleNameChange(request, {
    scope: "teacher",
    sessionId: teacher.id,
    apply: (name) => updateTeacherName(teacher.id, name),
  });
}
