import { currentTeacher, unauthorized } from "@/lib/auth";
import { setAssistantActive } from "@/lib/db";

/**
 * إيقاف مساعد/إعادة تفعيله — مشرف الحلقة فقط، بنمط /api/teacher/settings.
 * الهدف يجب أن يكون مساعداً بنفس حلقة المستدعي حصراً (الحلقة من الجلسة لا
 * من أي مدخل): مشرف آخر — أو المستدعي نفسه — أو معرّف حلقة أخرى كلها 404،
 * فلا يكشف المسار هل المعرّف موجود أصلاً أم لا.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.role !== "supervisor") {
    return Response.json({ error: "إيقاف المساعدين وتفعيلهم متاح لمشرف الحلقة فقط" }, { status: 403 });
  }

  const { id } = await params;
  const assistantId = Number(id);
  if (!Number.isInteger(assistantId)) {
    return Response.json({ error: "معرّف غير صحيح" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { active?: unknown };
  if (typeof body.active !== "boolean") {
    return Response.json({ error: "قيمة غير صحيحة" }, { status: 400 });
  }

  const updated = await setAssistantActive(teacher.halaqahId, assistantId, body.active);
  if (!updated) {
    return Response.json({ error: "لا يوجد مساعد بهذا المعرّف في حلقتك" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
