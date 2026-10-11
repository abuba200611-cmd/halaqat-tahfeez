import "server-only";

/*
  قائمة سماح لعناوين اشتراكات Web Push (منع SSRF): لا يُحفظ أي endpoint
  إلا إذا كان https لمضيف خدمة push حقيقية معروفة.
*/

const EXACT_PUSH_HOSTS = new Set([
  "fcm.googleapis.com",
  "updates.push.services.mozilla.com",
  "web.push.apple.com",
]);

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (EXACT_PUSH_HOSTS.has(host)) return true;
  return host.endsWith(".notify.windows.com") || host.endsWith(".push.apple.com");
}
