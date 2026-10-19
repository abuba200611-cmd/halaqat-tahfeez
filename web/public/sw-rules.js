/*
  قواعد التخزين المؤقت لعامل الخدمة — دوال صرفة بلا اعتماد على بيئة المتصفح،
  فيحمّلها sw.js بـ importScripts وتُختبر في Vitest (web/lib/pwa-sw.test.ts).

  المبدأ: لا نخزّن أبداً /api/* ولا أي HTML موثَّق. الأصول الثابتة المُجزّأة
  (مسارات فيها بصمة هاش) فقط تُخزَّن cache-first، والتنقّلات شبكة أولاً
  وتسقط إلى /offline (المُخزَّنة مسبقاً وقت التثبيت) عند انقطاع الشبكة.
*/
(function (root) {
  var CACHE_VERSION = "v1";
  var CACHE_PREFIX = "mos-";
  var STATIC_CACHE = CACHE_PREFIX + "static-" + CACHE_VERSION;
  var OFFLINE_CACHE = CACHE_PREFIX + "offline-" + CACHE_VERSION;
  var OFFLINE_URL = "/offline";

  /** هل الاسم من ذاكرات هذا التطبيق لكنه ليس من الإصدار الحالي (يُحذف عند التفعيل)؟ */
  function isStaleCacheName(name) {
    return name.indexOf(CACHE_PREFIX) === 0 && name !== STATIC_CACHE && name !== OFFLINE_CACHE;
  }

  /**
   * يصنّف طلباً: "static" (cache-first) | "navigate" (شبكة أولاً ثم /offline) | "bypass" (لا نلمسه).
   * pathname/origin من URL الطلب؛ ownOrigin أصل عامل الخدمة.
   */
  function classifyRequest(input) {
    var method = (input.method || "GET").toUpperCase();
    if (method !== "GET") return "bypass";
    var url;
    try {
      url = new URL(input.url, input.ownOrigin);
    } catch {
      return "bypass";
    }
    if (url.origin !== input.ownOrigin) return "bypass";
    var p = url.pathname;
    if (p === "/api" || p.indexOf("/api/") === 0) return "bypass";
    if (p === "/sw.js" || p === "/sw-rules.js") return "bypass";
    if (p.indexOf("/_next/static/") === 0 || p.indexOf("/brand/") === 0) return "static";
    if (input.mode === "navigate") return "navigate";
    return "bypass";
  }

  /** من نص HTML/CSS: يستخرج روابط /_next/static/... لتُخزَّن مسبقاً مع صفحة /offline */
  function extractStaticUrls(text) {
    var out = [];
    var re = /\/_next\/static\/[A-Za-z0-9_\-./%~]+\.(?:js|css|woff2?|ttf|otf|png|svg|ico)/g;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (out.indexOf(m[0]) === -1) out.push(m[0]);
    }
    return out;
  }

  var api = {
    CACHE_VERSION: CACHE_VERSION,
    CACHE_PREFIX: CACHE_PREFIX,
    STATIC_CACHE: STATIC_CACHE,
    OFFLINE_CACHE: OFFLINE_CACHE,
    OFFLINE_URL: OFFLINE_URL,
    isStaleCacheName: isStaleCacheName,
    classifyRequest: classifyRequest,
    extractStaticUrls: extractStaticUrls,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MOSSWRules = api;
})(typeof self !== "undefined" ? self : this);
