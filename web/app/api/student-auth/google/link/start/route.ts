import { googleAuthUrl } from "@/lib/google-auth";
import { createStudentGoogleLinkState } from "@/lib/student-google-auth";

/**
 * يبدأ رحلة Google لمسار "ربط طالب موجود مسبقاً" (STEP 6B) — منفصل تماماً
 * عن /api/student-auth/google/start (طالب جديد) وعن /api/auth/google
 * (المعلّم): state cookie مستقل، فلا تعارض بين المسارات الثلاثة.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/student-auth/google/link/callback`;
  const state = await createStudentGoogleLinkState();

  return Response.redirect(googleAuthUrl(redirectUri, state));
}
