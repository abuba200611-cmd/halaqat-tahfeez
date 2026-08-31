import "server-only";

import { currentMosqueAdmin } from "./mosque-auth";
import { currentSuperAdmin } from "./super-admin-auth";

/*
  فحص صلاحية الوصول لجامع معيّن — STEP 5. المشرف العام يصل لأي جامع،
  ومدير الجامع يصل فقط لجامعه المرتبط بجلسته. نفس منطق
  masjid-idara/lib/access.ts بالضبط، لكن مبني على جلستَي هذا المشروع
  الجديدتين (mosque-auth.ts و super-admin-auth.ts).
*/
export async function canAccessMosque(mosqueId: number): Promise<boolean> {
  if (await currentSuperAdmin()) return true;

  const admin = await currentMosqueAdmin();
  return admin?.mosqueId === mosqueId;
}
