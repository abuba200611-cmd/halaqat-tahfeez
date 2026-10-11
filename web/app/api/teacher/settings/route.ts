import { currentTeacher, unauthorized } from "@/lib/auth";
import { halaqahBuddyResetOnEdit, setHalaqahBuddyResetOnEdit } from "@/lib/db";

/** إعدادات الحلقة — القراءة لكل معلمي الحلقة (لعرض الحالة الحالية وتعطيل التبديل عن المساعدين) */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return Response.json({
    buddyResetOnEdit: await halaqahBuddyResetOnEdit(teacher.halaqahId),
    role: teacher.role,
  });
}

/**
 * يغيّر خيار "إعادة طلب تأكيد الزميل عند تعديل الورد" — مشرف الحلقة
 * (المالك) فقط، بنمط /api/teacher/invite/rotate حرفياً. halaqahId من
 * الجلسة حصراً، لا من أي مدخل عميل.
 */
export async function PATCH(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.role !== "supervisor") {
    return Response.json({ error: "تغيير إعدادات الحلقة متاح لمشرف الحلقة فقط" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { buddyResetOnEdit?: unknown };
  if (typeof body.buddyResetOnEdit !== "boolean") {
    return Response.json({ error: "قيمة غير صحيحة" }, { status: 400 });
  }

  await setHalaqahBuddyResetOnEdit(teacher.halaqahId, body.buddyResetOnEdit);
  return Response.json({ ok: true });
}
