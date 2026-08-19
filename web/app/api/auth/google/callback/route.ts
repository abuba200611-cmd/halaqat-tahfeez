import { cookies } from "next/headers";
import { findOrCreateTeacherByEmail } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { exchangeGoogleCode } from "@/lib/google-auth";

const STATE_COOKIE = "google_oauth_state";

/** يرجع لصفحة الدخول برسالة خطأ بالمعامل ?googleError= لتعرضها الواجهة */
function failure(origin: string, message: string): Response {
  return Response.redirect(`${origin}/?googleError=${encodeURIComponent(message)}`);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  if (!code || !state || !expectedState || state !== expectedState) {
    return failure(origin, "تعذّر التحقق من طلب الدخول — حاول مرة ثانية");
  }

  try {
    const profile = await exchangeGoogleCode(code, `${origin}/api/auth/google/callback`);
    const teacherId = await findOrCreateTeacherByEmail(profile.email);
    await setSessionCookie(teacherId);
    return Response.redirect(origin);
  } catch (error) {
    return failure(origin, error instanceof Error ? error.message : "تعذّر الدخول بحساب جوجل");
  }
}
