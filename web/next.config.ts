import type { NextConfig } from "next";

/*
  CSP صارمة — الأصول المسموحة فقط:
  - 'self': كل أصول التطبيق (Next على Vercel يخدم نفسه).
  - frame-src youtube-nocookie وحده: أرشيف الأنشطة يضمّن فيديوهات يوتيوب
    به (أي مرفق آخر يُفتح برابط خارجي لا iframe، فلا يحتاج أصلاً).
  - connect-src: 'self' + ingest.sentry.io (عميل Sentry عند ضبط DSN فقط).
  جوجل OAuth تحويلة مستوى أعلى (Response.redirect) لا قيد CSP عليها،
  وكاميرا QR تعمل بتطبيق الكاميرا الأصلي لا getUserMedia، فلا تحتاج شيئاً.
  'unsafe-inline' في script/style ضرورية لأن التطبيق يُبنى بصفحات ثابتة
  وPWA (سكربتات Next الأولية inline بلا nonce — الnonce يفرض عرضاً
  ديناميكياً كاملاً وهذا يكسر الصفحات الثابتة).
*/
const isDev = process.env.NODE_ENV === "development";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.ingest.sentry.io",
  "frame-src https://www.youtube-nocookie.com",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // الكاميرا ممنوعة في كل الصفحات: تسجيل الحضور بمسح QR يتم بتطبيق الكاميرا
  // الأصلي (يفتح رابطاً) لا بـgetUser داخل الصفحة، فلا صفحة تحتاجها
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: CSP },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // STEP 55 (إصلاح إنتاج): sharp يعمل بالبناء المحلي وبناء Vercel نفسه
  // بلا خطأ، لكن تتبّع الملفات لدالّتَي API هاتين فشل بإدراج
  // libvips-cpp.so.8.18.7 ضمنياً — sharp يحمّله عبر dlopen() وقت
  // التشغيل لا require() ثابت، فالتتبّع الساكن لا يكتشفه تلقائياً
  // (فجوة موثّقة بـTurbopack مع الحزم الأصلية المعقّدة). أُدرجه صراحة.
  outputFileTracingIncludes: {
    "/api/suggestions": ["./node_modules/@img/**/*"],
    "/api/student/suggestions": ["./node_modules/@img/**/*"],
    // M6: دليل MOS يُقرأ من القرص وقت التشغيل (lib/agent/guide.md) — يُدرَج
    // صراحة بتبعيات مسارات الإيجنت لأن قراءة readFileSync لا يكتشفها التتبّع الساكن
    "/api/mosques/[id]/agent/**": ["./lib/agent/guide.md"],
  },
  async headers() {
    return [
      {
        // كل المسارات: الميكروفون محجوب؛ القاعدة التالية تتغلّب عليها لصفحة التلاوة (آخر قاعدة تفوز بنفس المفتاح)
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
      {
        // STEP 64: صفحة تسجيل التلاوة وحدها تسمح بالميكروفون لنفس الأصل (self)
        source: "/student/recitations",
        headers: SECURITY_HEADERS.map((h) =>
          h.key === "Permissions-Policy"
            ? { key: h.key, value: "camera=(), microphone=(self), geolocation=()" }
            : h,
        ),
      },
    ];
  },
};

export default nextConfig;
