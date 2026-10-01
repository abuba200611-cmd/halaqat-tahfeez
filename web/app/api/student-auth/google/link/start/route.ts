import { googleAuthUrl } from "@/lib/google-auth";
import { createStudentGoogleLinkState } from "@/lib/student-google-auth";

/**
 * يبدأ رحلة Google لمسار "ربط طالب موجود مسبقاً" (STEP 6B) — منفصل تماماً
 * عن /api/student-auth/google/start (طالب جديد) وعن /api/auth/google
 * (المعلّم): state cookie مستقل، فلا تعارض بين المسارات الثلاثة.
 *
 * ?mode=login (زر "الدخول بحساب Google" بصفحة دخول الطالب العادية):
 * نفس هذا المسار بالضبط، فقط يُحفظ mode داخل كوكي الـstate نفسها حتى
 * يغيّر الـcallback سلوكه عند عدم وجود حساب مربوط (رسالة بدل نموذج
 * رمز الربط) — بلا مسار Google OAuth أو redirect URI جديد يحتاج
 * تسجيلاً بـGoogle Cloud Console.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const redirectUri = `${origin}/api/student-auth/google/link/callback`;
  const mode = url.searchParams.get("mode") === "login" ? "login" : "link";
  const state = await createStudentGoogleLinkState(mode);

  return Response.redirect(googleAuthUrl(redirectUri, state));
}
