import "server-only";

import { isAdmin, unauthorized } from "./mosque/admin-auth";
import { currentImpersonation, impersonationBlocked } from "./dev-impersonation";

/*
  بوابة موحّدة لكل مسارات /api/dev: يلزم جلسة الأدمن القائمة
  (ADMIN_SECRET نفسها التي تفتح /admin والجوامع)، ويرفض الطلب أثناء
  «عرض كـ» النشط — لا تُدار المنصة من داخل جلسة منتحَلة.
*/

export async function devConsoleGate(): Promise<Response | null> {
  if (!(await isAdmin())) return unauthorized();
  if (await currentImpersonation()) return impersonationBlocked();
  return null;
}
