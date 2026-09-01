import { consumeStudentGoogleLinkToken, checkStudentLinkRateLimit } from "@/lib/db";
import { setStudentSessionCookie } from "@/lib/auth";
import {
  clearStudentGoogleLinkPendingCookie,
  readStudentGoogleLinkPendingCookie,
} from "@/lib/student-google-auth";

/** أول عنوان بترويسة x-forwarded-for، أو "unknown" محلياً بلا بروكسي — نفس نمط /api/auth/register */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * يكمل ربط طالب موجود مسبقاً بحساب Google (STEP 6B): يستهلك رمز الربط
 * الذي أدخله الطالب بعملية ذرّية واحدة، ثم يفتح جلسة الطالب العادية
 * (halaqa_student) — بلا أي كوكي جديد يتعارض معها. مصدر sub الوحيد
 * الموثوق هو pending cookie الموقّع؛ أي sub يرسله العميل بالجسم يُتجاهل
 * كلياً.
 */
export async function POST(request: Request) {
  if (!(await checkStudentLinkRateLimit(clientIp(request)))) {
    return Response.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const pending = await readStudentGoogleLinkPendingCookie();
  if (!pending) {
    return Response.json(
      { error: "انتهت جلسة الدخول بجوجل — سجّل الدخول بحساب جوجل مرة أخرى" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const linkCode = String(body.linkCode ?? "").trim();
  if (!linkCode) return Response.json({ error: "أدخل رمز الربط" }, { status: 400 });

  const result = await consumeStudentGoogleLinkToken(linkCode, pending.sub, pending.email);

  if (!result.ok) {
    // رسالة موحّدة لرمز خاطئ/منتهٍ/مُستخدَم — بلا تمييز السبب للعميل
    const message =
      result.reason === "sub_already_linked"
        ? "حساب جوجل هذا مرتبط بطالب آخر بالفعل"
        : "رمز الربط غير صحيح أو منتهي الصلاحية";
    return Response.json({ error: message }, { status: 400 });
  }

  await setStudentSessionCookie(result.halaqahId, result.studentId);
  await clearStudentGoogleLinkPendingCookie();
  return Response.json({ ok: true });
}
