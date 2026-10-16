import { currentImpersonation, impersonationLabel } from "@/lib/dev-impersonation";
import { ImpersonationBanner } from "./banner";

/**
 * غلاف خادمي للشريط الأحمر: يقرر إن كانت جلسة «عرض كـ» فعّالة ويحلّ
 * تسمية الهدف، ولا يُصيّر شيئاً في الوضع العادي.
 */
export async function ImpersonationBannerBar() {
  const info = await currentImpersonation();
  if (!info) return null;
  return <ImpersonationBanner label={await impersonationLabel(info)} />;
}
