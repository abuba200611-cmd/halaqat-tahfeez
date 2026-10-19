import { currentTeacher, unauthorized } from "@/lib/auth";
import { halaqahClassmatesVisible, setHalaqahClassmatesVisible } from "@/lib/db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/** حالة إظهار الزملاء لحلقة المعلّم (من الجلسة) ودوره */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return Response.json({
    classmatesVisible: await halaqahClassmatesVisible(teacher.halaqahId),
    role: teacher.role,
  });
}

/** يشغّل/يطفّئ إظهار الزملاء — مشرف الحلقة فقط، وhalaqahId من الجلسة حصراً */
export async function PATCH(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.role !== "supervisor") {
    return Response.json({ error: "تغيير إعدادات الحلقة متاح لمشرف الحلقة فقط" }, { status: 403 });
  }
  if (!(await checkRateLimit(`classmates-setting:${teacher.halaqahId}`, 30, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { classmatesVisible?: unknown };
  if (typeof body.classmatesVisible !== "boolean") {
    return Response.json({ error: "قيمة غير صحيحة" }, { status: 400 });
  }

  await setHalaqahClassmatesVisible(teacher.halaqahId, body.classmatesVisible);
  return Response.json({ ok: true });
}
