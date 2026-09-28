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
};

export default nextConfig;
