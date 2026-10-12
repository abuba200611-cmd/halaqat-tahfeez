import "server-only";

/*
  تجزئة كلمات مرور مديري الجوامع = نفس دالتَي المعلّمين بالضبط (scrypt بصيغة
  salt:hash) — مصدر واحد في lib/auth.ts بدل نسخة ثانية.
*/
export { hashPassword, verifyPassword } from "@/lib/auth";
