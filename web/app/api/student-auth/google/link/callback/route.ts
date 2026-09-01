import { findGoogleStudentAccount } from "@/lib/db";
import { exchangeGoogleCode } from "@/lib/google-auth";
import { setStudentSessionCookie } from "@/lib/auth";
import { consumeStudentGoogleLinkState, setStudentGoogleLinkPendingCookie } from "@/lib/student-google-auth";

/** يرجع لصفحة الربط مع حالة توضّح للواجهة ماذا تعرض */
function toLinkPage(origin: string, params: Record<string, string>): Response {
  const url = new URL("/student-link", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url.toString());
}

/**
 * مسار STEP 6B فقط: ربط طالب موجود مسبقاً. لا يُنشئ أي student أو
 * student_accounts هنا مباشرة. إن كان الـsub مرتبطاً بحساب فعلاً، هذا
 * تسجيل دخول عادي — نفتح جلسة الطالب مباشرة (خلافاً لمسار "طالب جديد"
 * الذي يوقف المسار برسالة فقط). إن لم يوجد، نحفظ هوية جوجل مؤقتاً
 * بكوكي مستقل عن STEP 6A وننتقل لخطوة إدخال رمز الربط.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || !(await consumeStudentGoogleLinkState(state))) {
    return toLinkPage(origin, { error: "تعذّر التحقق من طلب الدخول — حاول مرة ثانية" });
  }

  try {
    const profile = await exchangeGoogleCode(code, `${origin}/api/student-auth/google/link/callback`);

    const existing = await findGoogleStudentAccount(profile.sub);
    if (existing) {
      await setStudentSessionCookie(existing.halaqahId, existing.studentId);
      return Response.redirect(`${origin}/student`);
    }

    await setStudentGoogleLinkPendingCookie(profile.sub, profile.email);
    return toLinkPage(origin, { step: "code" });
  } catch (error) {
    return toLinkPage(origin, { error: error instanceof Error ? error.message : "تعذّر الدخول بحساب جوجل" });
  }
}
