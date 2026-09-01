import { googleAuthUrl } from "@/lib/google-auth";
import { createStudentGoogleState } from "@/lib/student-google-auth";

/** يبدأ رحلة Google للطالب — منفصلة تماماً عن /api/auth/google الخاص بالمعلّم */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/student-auth/google/callback`;
  const state = await createStudentGoogleState();

  return Response.redirect(googleAuthUrl(redirectUri, state));
}
