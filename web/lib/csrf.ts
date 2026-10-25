/*
  فحص CSRF مركزي للطلبات المغيِّرة (غير GET/HEAD/OPTIONS) إلى /api/* —
  منطق صرف بلا أي استيراد من Next (نمط lib/hosts.ts وlib/landing.ts)،
  فيُستخدم من proxy.ts ويُختبر مباشرة.

  القاعدة: طلب المتصفح عبر النطاق نفسه يحمل دائماً دليلاً على أصله:
  - Origin على كل طلبات POST الحديثة (حتى same-origin)، أو
  - Sec-Fetch-Site (متصفحات ٢٠٢٣+)، أو
  - Referer.
  فإذا وُجد أي دليل منها ولم يطابق مستضيف الطلب → رفض 403. وإذا غابت
  كلها فالمرسل ليس متصفحاً (curl/خادم لخادم بسرّ خاص أو توقيع خاص) —
  تُقيّدها المسارات المستثناة أدناه أو فحوص السرّ/التوقيع داخل المسار نفسه.

  المسارات المستثناة (تتحقق من أصالة الطلب بنفسها):
  - /api/webhooks/*: توقيع HMAC على الجسم الخام.
  - /api/link/*: سرّ خادم-لخادم (X-Link-Secret) بمقارنة زمن-ثابت.
  - /api/v1/*: مفاتيح Bearer بلا كوكيات — CSRF لا معنى له فيها.
*/

/** طرق القراءة الآمنة من فحص CSRF */
export function isSafeMethod(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

/** مسارات تتحقق من أصالة الطلب بتوقيعها أو سرّها الخاص فلا تحتاج فحص الأصل */
export function isCsrfExcludedPath(pathname: string): boolean {
  return (
    pathname === "/api/webhooks" ||
    pathname.startsWith("/api/webhooks/") ||
    pathname === "/api/link" ||
    pathname.startsWith("/api/link/") ||
    pathname === "/api/v1" ||
    pathname.startsWith("/api/v1/")
  );
}

/** يستحق هذا الطلب فحص CSRF؟ (تحت /api، مغيِّر، وغير مستثنى) */
export function shouldCheckCsrf(method: string, pathname: string): boolean {
  if (isSafeMethod(method)) return false;
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return false;
  return !isCsrfExcludedPath(pathname);
}

/**
 * مقارنة أصل الطلب بمستضيفه: تُطبَّع الأطراف (حروف صغيرة، إسقاط منفذ
 * 443/80 الافتراضي) فلا يفشل التطابق بسبب صيغة المنفذ الافتراضي فقط.
 * يعيد اسم المستضيج المطابق (origin-host / referer-host) أو null عند
 * عدم تطابق.
 */
function matchesRequestHost(sourceHost: string | null, requestHost: string | null): boolean {
  if (!sourceHost || !requestHost) return false;
  const normalize = (h: string) => h.trim().toLowerCase().replace(/:(443|80)$/, "");
  return normalize(sourceHost) === normalize(requestHost);
}

/** مستضيج الطلب كما يراه الخادم خلف الوكيل: x-forwarded-host أولاً ثم host */
export function requestHostOf(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || headers.get("host");
}

function hostOfUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host || null;
  } catch {
    return null;
  }
}

/**
  الفحص المركزي. يعيد true فقط إذا وُجد دليل أصل (Origin/Sec-Fetch-Site/
  Referer) ولم يطابق مستضيج الطلب. غياب الأدلة كلها = ليس متصفحاً = يمر
  (البوابة الخادمية داخل المسار تتحقق من الهوية/السرّ بنفسها).
*/
export function csrfBlocked(
  method: string,
  pathname: string,
  headers: { get(name: string): string | null },
): boolean {
  if (!shouldCheckCsrf(method, pathname)) return false;

  const host = requestHostOf(headers);

  const origin = headers.get("origin");
  if (origin) {
    // "null" أصل مُعمَّى (sandbox/redirect عبر بروتوكول data:) — لا يُقبل
    if (origin === "null") return true;
    return !matchesRequestHost(hostOfUrl(origin), host);
  }

  const secFetchSite = headers.get("sec-fetch-site");
  if (secFetchSite) {
    // same-origin وحده مقبول؛ same-site (نطاق أخ من الجامع نفسه) يُرفض —
    // كل نداءات التطبيق نسبية لنفس الأصل
    if (secFetchSite === "same-origin") return false;
    // "none" يعني طلب مستخدم مباشر؛ لا يصدر عن fetch داخل التطبيق
    return true;
  }

  const referer = headers.get("referer");
  if (referer) {
    return !matchesRequestHost(hostOfUrl(referer), host);
  }

  // لا Origin ولا Sec-Fetch-Site ولا Referer — عميل غير متصفح
  return false;
}
