import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // STEP 55 (إصلاح إنتاج): sharp يعمل بالبناء المحلي وبناء Vercel نفسه
  // بلا خطأ، لكن تتبّع الملفات لدالّتَي API هاتين فشل بإدراج
  // libvips-cpp.so.8.18.7 ضمنياً — sharp يحمّله عبر dlopen() وقت
  // التشغيل لا require() ثابت، فالتتبّع الساكن لا يكتشفه تلقائياً
  // (فجوة موثّقة بـTurbopack مع الحزم الأصلية المعقّدة). أُدرجه صراحة.
  outputFileTracingIncludes: {
    "/api/suggestions": ["./node_modules/@img/**/*"],
    "/api/student/suggestions": ["./node_modules/@img/**/*"],
  },
  async headers() {
    return [
      {
        // كل المسارات عدا صفحة تسجيل التلاوة: الميكروفون محجوب كما كان
        source: "/((?!student/recitations$).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
      {
        // STEP 64: صفحة تسجيل التلاوة وحدها تسمح بالميكروفون لنفس الأصل (self)
        source: "/student/recitations",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

export default nextConfig;
