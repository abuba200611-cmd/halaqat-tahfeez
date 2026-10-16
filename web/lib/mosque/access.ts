import "server-only";

import { isAdmin } from "./admin-auth";
import { currentMosqueAdmin } from "@/lib/mosque-auth";

/**
 * صلاحية الوصول لجامع معيّن: إما المشرف العام (يرى كل شيء)، أو مدير
 * هذا الجامع بالذات (لا يرى جوامع غيره). تُستخدم بكل مسار يتعامل مع
 * جامع محدد (إضافة حلقة، عرض التفاصيل، التوزيع).
 */
export async function canAccessMosque(mosqueId: number): Promise<boolean> {
  if (await isAdmin()) return true;
  const mosqueAdmin = await currentMosqueAdmin();
  return mosqueAdmin?.mosqueId === mosqueId;
}
