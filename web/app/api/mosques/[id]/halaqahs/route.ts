import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { createHalaqah, getMosque, isFeatureEnabled } from "@/lib/mosque/db";
import { fetchHalaqahInfo } from "@/lib/mosque/halaqat";

/**
 * يضيف حلقة للجامع عن طريق رمز دعوتها بنظام المعلّم — يتحقق من صحة
 * الرمز أولاً ويجيب اسم الحلقة/المعلّم منه مباشرة (لا إدخال يدوي عرضة
 * للخطأ)، فلو الرمز غلط يرفض الإضافة فوراً بدل ما يحفظ ربطاً معطوباً.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  if (!(await isFeatureEnabled(mosqueId, "halaqat"))) {
    return Response.json({ error: "الحلقات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { inviteCode?: unknown };
  const inviteCode = String(body.inviteCode ?? "").trim();
  if (!inviteCode) return Response.json({ error: "رمز الدعوة مطلوب" }, { status: 400 });

  const info = await fetchHalaqahInfo(inviteCode);
  if (!info) {
    return Response.json({ error: "رمز الدعوة غير صحيح، أو نظام المعلّم غير متاح حالياً" }, { status: 400 });
  }

  const id = await createHalaqah(mosqueId, info.halaqahName, info.teacherName, inviteCode);
  return Response.json({ ok: true, id, halaqahName: info.halaqahName, teacherName: info.teacherName });
}
