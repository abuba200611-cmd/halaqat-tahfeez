/*
  فصل لوحة المطوّر عن المنصة العامة بالمستضيف (dev split). هذا الملف
  منطق صرف بلا أي استيراد من Next — يُستخدم من proxy.ts (بيئة مستقلة
  عن الوحدات الخادمية) ومن حرّاس الخادم (lib/host-gate.ts) معاً.

  مستضيفو اللوحة:
  1. mos-dev-console.vercel.app (نطاق نشر اللوحة الثابت).
  2. أي مدخل بDEV_CONSOLE_HOSTS (قائمة مفصولة بفواصل، اختياري) —
     لنطاقات المعاينة مثلاً.
  3. localhost/127.0.0.1 بأي منفذ — خارج الإنتاج فقط.
*/

export const DEV_CONSOLE_HOST = "mos-dev-console.vercel.app";

/** قائمة مستضيفي اللوحة الآن: الثابت + البيئة (بلا منافذ) */
export function devConsoleHosts(): string[] {
  const fromEnv = (process.env.DEV_CONSOLE_HOSTS ?? "")
    .split(",")
    .map((h) => normalizeHost(h))
    .filter((h): h is string => h !== null);
  return [DEV_CONSOLE_HOST, ...fromEnv];
}

function normalizeHost(host: string): string | null {
  const noPort = host.trim().toLowerCase().replace(/:\d+$/, "");
  return noPort || null;
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
}

/**
 * هل هذا المستضيف (بترويسة Host) مستضيف لوحة المطوّر؟ المنفذ يُتجاهَل،
 * وlocalhost يقبل بأي منفذ خارج الإنتاج فقط.
 */
export function isDevConsoleHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const normalized = normalizeHost(host);
  if (normalized === null) return false;
  if (process.env.NODE_ENV !== "production" && isLocalHost(normalized)) return true;
  return devConsoleHosts().includes(normalized);
}

/**
 * المستضيف الذي ورد عليه الطلب: x-forwarded-host أولاً (خلف وكيل —
  على Vercel يحمل النطاق الأصلي) وإلا ترويسة host نفسها. القيمة قد
  تحمل قائمة مفصولة بفواصل فنأخذ الأولى.
 */
export function requestHost(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || headers.get("host");
}
