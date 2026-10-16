import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getHalaqah, isFeatureEnabled } from "@/lib/mosque/db";
import { getHalaqahRoster } from "@/lib/mosque/halaqat";

/** قائمة طلاب حلقة بعينها (بالاسم) + اسم معلّمها — استعلام مباشر لقاعدة الحلقات، وتتبع ميزة "الحلقات" */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const halaqahId = parsePositiveIntParam((await params).id);
  if (halaqahId === null) return paramNotFound();
  const halaqah = await getHalaqah(halaqahId);
  // حلقة بلا جامع (mosqueId null) أو غير موجودة = 404 للجميع؛ لا تكشف حلقات المعلّمين غير المنضمّة
  if (!halaqah || halaqah.mosqueId === null) return Response.json({ error: "الحلقة غير موجودة" }, { status: 404 });
  if (!(await canAccessMosque(halaqah.mosqueId))) return unauthorized();
  if (!(await isFeatureEnabled(halaqah.mosqueId, "halaqat"))) {
    return Response.json({ error: "الحلقات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }

  const roster = await getHalaqahRoster(halaqah);
  return Response.json({ halaqah, roster });
}
