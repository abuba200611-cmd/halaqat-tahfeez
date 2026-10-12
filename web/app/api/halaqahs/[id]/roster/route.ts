import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getHalaqah, isFeatureEnabled } from "@/lib/mosque/db";
import { fetchHalaqahRoster } from "@/lib/mosque/halaqat";

/** قائمة طلاب حلقة بعينها (بالاسم) + اسم معلّمها — من نظام المعلّم حيّاً، وتتبع ميزة "الحلقات" */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const halaqahId = Number((await params).id);
  const halaqah = await getHalaqah(halaqahId);
  if (!halaqah) return Response.json({ error: "الحلقة غير موجودة" }, { status: 404 });
  if (!(await canAccessMosque(halaqah.mosqueId))) return unauthorized();
  if (!(await isFeatureEnabled(halaqah.mosqueId, "halaqat"))) {
    return Response.json({ error: "الحلقات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }

  const roster = await fetchHalaqahRoster(halaqah.inviteCode);
  if (!roster) {
    return Response.json({ error: "تعذّر الوصول لنظام المعلّم حالياً" }, { status: 502 });
  }

  return Response.json({ halaqah, roster });
}
