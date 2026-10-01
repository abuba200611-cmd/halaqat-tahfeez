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

/** يرجع لصفحة دخول الطالب العادية مع حالة خطأ توضّح للواجهة ماذا تعرض (مسار mode=login فقط) */
function toStudentLoginPage(origin: string, params: Record<string, string>): Response {
  const url = new URL("/student", origin);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return Response.redirect(url.toString());
}

/**
 * مسار STEP 6B: ربط طالب موجود مسبقاً، أو (mode=login) إعادة دخول
 * طالب مربوط مسبقاً من صفحة دخول الطالب العادية. لا يُنشئ أي student
 * أو student_accounts هنا مباشرة بأي حال.
 *
 * mode يأتي من consumeStudentGoogleLinkState حصراً (محفوظ بكوكي
 * الـstate الموقَّعة وقت /start) — لا يُقرأ أبداً من معامل مستقل بهذا
 * الرابط، فتعديل الرابط يدوياً لا يغيّر أي سلوك.
 *
 * - أيّ mode + حساب مربوط: تسجيل دخول عادي — نفتح جلسة الطالب مباشرة
 *   (خلافاً لمسار "طالب جديد" STEP 6A الذي يوقف المسار برسالة فقط).
 * - mode=login + حساب غير مربوط: رسالة واضحة على صفحة دخول الطالب —
 *   لا نموذج رمز ربط، لا إنشاء، لا ربط تلقائي بلا دعوة أو رمز.
 * - mode=link (الافتراضي، STEP 6B الأصلي) + حساب غير مربوط: نحفظ هوية
 *   جوجل مؤقتاً وننتقل لخطوة إدخال رمز الربط — بلا تغيير عن السابق.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return toLinkPage(origin, { error: "تعذّر التحقق من طلب الدخول — حاول مرة ثانية" });
  }
  const { ok, mode } = await consumeStudentGoogleLinkState(state);
  if (!ok) {
    return mode === "login"
      ? toStudentLoginPage(origin, { googleError: "failed" })
      : toLinkPage(origin, { error: "تعذّر التحقق من طلب الدخول — حاول مرة ثانية" });
  }

  try {
    const profile = await exchangeGoogleCode(code, `${origin}/api/student-auth/google/link/callback`);

    const existing = await findGoogleStudentAccount(profile.sub);
    if (existing) {
      await setStudentSessionCookie(existing.halaqahId, existing.studentId);
      return Response.redirect(`${origin}/student`);
    }

    if (mode === "login") {
      return toStudentLoginPage(origin, { googleError: "not_linked" });
    }

    await setStudentGoogleLinkPendingCookie(profile.sub, profile.email);
    return toLinkPage(origin, { step: "code" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذّر الدخول بحساب جوجل";
    return mode === "login" ? toStudentLoginPage(origin, { googleError: "failed" }) : toLinkPage(origin, { error: message });
  }
}
