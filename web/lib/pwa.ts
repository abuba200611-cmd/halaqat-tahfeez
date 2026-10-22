import type { MetadataRoute } from "next";
import { isDevConsoleHost } from "@/lib/hosts";

/*
  منطق PWA الصرف (بلا React/Next) — يُختبر مباشرة:
  - بيانات الـmanifest، وبناء assetlinks لتطبيق أندرويد (TWA)،
  - قرار إظهار لافتة «ثبّت التطبيق».
*/

export const APP_NAME = "السلام — نظام تشغيل الجامع";
export const APP_SHORT_NAME = "السلام";
export const APP_DESCRIPTION = "منصة السلام (MOS): الحلقات والحضور والحفظ والمراجعة وأولياء الأمور وإدارة الجامع في مكان واحد.";
export const THEME_COLOR = "#000000";

/* تطبيق لوحة المطوّر — يُثبَّت منفصلاً عن «السلام» من مستضيف اللوحة (lib/hosts.ts) */
export const DEV_APP_NAME = "لوحة المطوّر — MOS";
export const DEV_APP_SHORT_NAME = "المطوّر";
export const DEV_APP_DESCRIPTION = "لوحة المطوّر (MOS): الجوامع والطلبات والبلاغات وصادر واتساب من شاشتك الرئيسية.";

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

/** لوحة المطوّر ملك المالك وحده: تظهر اللافتة من أول زيارة */
export const DEV_INSTALL_MIN_VISITS = 1;
export const DEV_INSTALL_DISMISSED_KEY = "mos_dev_pwa_dismissed";

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
  /** الحد الأدنى للزيارات (الافتراضي INSTALL_MIN_VISITS) */
  minVisits?: number;
}): InstallPlatform {
  if (opts.standalone || opts.dismissed || opts.visits < (opts.minVisits ?? INSTALL_MIN_VISITS)) return "none";
  if (opts.hasPrompt) return "android";
  if (isIosSafari(opts.ua)) return "ios";
  return "none";
}

/* ————— مانيفست حسب المستضيف ————— */

const ICON = (name: string) => `/brand/icons/${name}`;
const SHORTCUT_ICONS = [{ src: ICON("icon-192.png"), sizes: "192x192", type: "image/png" }];

/** مانيفست «السلام» العام (المنصة) */
export function mainManifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: APP_DESCRIPTION,
    lang: "ar",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ["education", "productivity"],
    icons: [
      { src: ICON("icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICON("icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ICON("icon-512-maskable.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "دخول", short_name: "دخول", url: "/login", icons: SHORTCUT_ICONS },
      { name: "رسائل", short_name: "رسائل", url: "/messages", icons: SHORTCUT_ICONS },
      { name: "الحضور", short_name: "الحضور", url: "/attendance", icons: SHORTCUT_ICONS },
    ],
  };
}

/** مانيفست لوحة المطوّر — تطبيق منفصل (id مختلف) بأيقونة عليها شارة تمييز */
export function devManifest(): MetadataRoute.Manifest {
  const icons = [{ src: ICON("dev-192.png"), sizes: "192x192", type: "image/png" }];
  return {
    id: "/dev",
    name: DEV_APP_NAME,
    short_name: DEV_APP_SHORT_NAME,
    description: DEV_APP_DESCRIPTION,
    lang: "ar",
    dir: "rtl",
    start_url: "/dev",
    scope: "/",
    display: "standalone",
    background_color: THEME_COLOR,
    theme_color: THEME_COLOR,
    categories: ["productivity", "utilities"],
    icons: [
      { src: ICON("dev-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: ICON("dev-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: ICON("dev-512-maskable.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "الجوامع", short_name: "الجوامع", url: "/dev/mosques", icons },
      { name: "طلبات الجوامع", short_name: "الطلبات", url: "/dev/mosque-requests", icons },
      { name: "البلاغات", short_name: "البلاغات", url: "/dev/reports", icons },
      { name: "صادر واتساب", short_name: "واتساب", url: "/dev/whatsapp", icons },
    ],
  };
}

/** المانيفست المناسب للمستضيف: مستضيف اللوحة → مانيفست المطوّر، وإلا العام */
export function manifestForHost(host: string | null | undefined): MetadataRoute.Manifest {
  return isDevConsoleHost(host) ? devManifest() : mainManifest();
}
