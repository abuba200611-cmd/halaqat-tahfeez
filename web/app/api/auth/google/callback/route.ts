import { cookies } from "next/headers";
import { findTeacherIdByGoogleEmail } from "@/lib/db";
import { setSessionCookie } from "@/lib/auth";
import { recordLogin } from "@/lib/activity";
import { exchangeGoogleCode } from "@/lib/google-auth";
import { setGoogleHandoffCookie } from "@/lib/google-handoff";
import { INTRO_COOKIE } from "@/lib/landing";
import { safeEqual } from "@/lib/safe-equal";

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

  if (!code || !state || !expectedState || !safeEqual(state, expectedState)) {
    return failure(origin, "تعذّر التحقق من طلب الدخول — حاول مرة ثانية");
  }

  try {
    const profile = await exchangeGoogleCode(code, `${origin}/api/auth/google/callback`);
    const teacherId = await findTeacherIdByGoogleEmail(profile.email);
    if (teacherId === null) {
      // لا حساب بهذا البريد: لا نُنشئ حساباً ناقصاً — نحمل هوية جوجل لتسجيل
      // جديد بتسليم موقّع، ونعتبر الترحيب مجتازاً حتى لا تردّه بوابته
      await setGoogleHandoffCookie({ email: profile.email, name: profile.name });
      store.set(INTRO_COOKIE, "1", {
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
      });
      return Response.redirect(`${origin}/signup?google=1`);
    }
    await setSessionCookie(teacherId);
    await recordLogin({ role: "teacher", teacherId });
    return Response.redirect(origin);
  } catch (error) {
    return failure(origin, error instanceof Error ? error.message : "تعذّر الدخول بحساب جوجل");
  }
}
