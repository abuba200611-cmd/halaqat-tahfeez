import { googleAuthUrl } from "@/lib/google-auth";
import {
  clearStudentGoogleInviteCookie,
  createStudentGoogleState,
  normalizeInviteCode,
  setStudentGoogleInviteCookie,
} from "@/lib/student-google-auth";

/** يبدأ رحلة Google للطالب — منفصلة تماماً عن /api/auth/google الخاص بالمعلّم */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/student-auth/google/callback`;
  const state = await createStudentGoogleState();

  // رمز الدعوة من رابط المعلّم (إن وُجد) يُحفظ ليعود جاهزاً بعد Google؛
  // وبدونه نمسح أي رمز قديم عالق حتى لا تُعبّأ الخانة برمز حلقة سابقة.
  const invite = normalizeInviteCode(url.searchParams.get("invite"));
  if (invite) await setStudentGoogleInviteCookie(invite);
  else await clearStudentGoogleInviteCookie();

  return Response.redirect(googleAuthUrl(redirectUri, state));
}
