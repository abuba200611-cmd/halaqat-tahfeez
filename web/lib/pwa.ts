/*
  منطق PWA الصرف (بلا React/Next) — يُختبر مباشرة:
  - بيانات الـmanifest، وبناء assetlinks لتطبيق أندرويد (TWA)،
  - قرار إظهار لافتة «ثبّت التطبيق».
*/

export const APP_NAME = "السلام — نظام تشغيل الجامع";
export const APP_SHORT_NAME = "السلام";
export const APP_DESCRIPTION = "منصة السلام (MOS): الحلقات والحضور والحفظ والمراجعة وأولياء الأمور وإدارة الجامع في مكان واحد.";
export const THEME_COLOR = "#000000";

/** معرّف حزمة أندرويد المبدئي — يغيّره المالك في Bubblewrap إن اختار غيره، ثم يطابقه هنا */
export const ANDROID_PACKAGE_NAME = "sa.alsalam.mos";

const SHA256_FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/**
 * يبني محتوى /.well-known/assetlinks.json من قيمة ANDROID_ASSETLINKS_SHA256
 * (بصمة واحدة أو عدة بصمات مفصولة بفاصلة). يرجع null إن لم تُضبط أو كانت أي بصمة غير صالحة.
 */
export function buildAssetLinks(raw: string | undefined, packageName: string = ANDROID_PACKAGE_NAME) {
  if (!raw) return null;
  const prints = raw
    .split(",")
    .map((p) => p.trim().toUpperCase())
    .filter(Boolean);
  if (prints.length === 0 || !prints.every((p) => SHA256_FINGERPRINT.test(p))) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: prints },
    },
  ];
}

/* ————— لافتة التثبيت ————— */

export const INSTALL_VISITS_KEY = "mos_pwa_visits";
export const INSTALL_DISMISSED_KEY = "mos_pwa_dismissed";
/** تظهر اللافتة من الزيارة الثانية */
export const INSTALL_MIN_VISITS = 2;

export type InstallPlatform = "android" | "ios" | "none";

/** iOS Safari فقط (كروم/فايرفوكس على آيفون لا يعرضان «أضف إلى الشاشة الرئيسية» بنفس الطريقة) */
export function isIosSafari(ua: string): boolean {
  const ios = /iPad|iPhone|iPod/.test(ua);
  return ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

export function installBannerMode(opts: {
  visits: number;
  dismissed: boolean;
  standalone: boolean;
  hasPrompt: boolean;
  ua: string;
}): InstallPlatform {
  if (opts.standalone || opts.dismissed || opts.visits < INSTALL_MIN_VISITS) return "none";
  if (opts.hasPrompt) return "android";
  if (isIosSafari(opts.ua)) return "ios";
  return "none";
}
