import { currentTeacher, unauthorized } from "@/lib/auth";
import { findHalaqahMosque } from "@/lib/mosque/db";

/** جامع حلقة المعلّم الحالي (أو null) ودوره — لقسم «الانضمام لجامع» بالإعدادات. الحلقة من الجلسة حصراً. */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const mosque = await findHalaqahMosque(teacher.halaqahId);
  return Response.json({
    role: teacher.role,
    mosque: mosque ? { name: mosque.name, city: mosque.city } : null,
  });
}
