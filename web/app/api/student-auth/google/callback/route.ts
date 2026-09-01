import { findGoogleStudentAccount } from "@/lib/db";
import { exchangeGoogleCode } from "@/lib/google-auth";
import { consumeStudentGoogleState, setStudentGooglePendingCookie } from "@/lib/student-google-auth";

/** يرجع لصفحة الانضمام مع حالة توضّح للواجهة ماذا تعرض */
function toJoinPage(origin: string, params: Record<string, string>): Response {
  const url = new URL("/student-join", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url.toString());
}

/**
 * مسار STEP 6A فقط: طالب جديد فعلاً. لا يسجّل دخول أحد هنا مباشرة —
 * إن وُجد الحساب مسبقاً نوقف المسار برسالة واضحة (مسار الربط لطالب
 * موجود مؤجَّل لـ STEP 6B). إن لم يوجد، نحفظ هوية جوجل مؤقتاً وننتقل
 * لخطوة رمز الدعوة.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state || !(await consumeStudentGoogleState(state))) {
    return toJoinPage(origin, { error: "تعذّر التحقق من طلب الدخول — حاول مرة ثانية" });
  }

  try {
    const profile = await exchangeGoogleCode(code, `${origin}/api/student-auth/google/callback`);

    const existing = await findGoogleStudentAccount(profile.sub);
    if (existing) {
      return toJoinPage(origin, { linked: "1" });
    }

    await setStudentGooglePendingCookie(profile.sub, profile.email);
    return toJoinPage(origin, { step: "invite" });
  } catch (error) {
    return toJoinPage(origin, { error: error instanceof Error ? error.message : "تعذّر الدخول بحساب جوجل" });
  }
}
