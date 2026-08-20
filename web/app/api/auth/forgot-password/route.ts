import { checkRegisterRateLimit, createPasswordReset, findTeacherByUsername } from "@/lib/db";
import { sendMail } from "@/lib/mail";

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** رسالة نجاح واحدة دائماً — لا نكشف إن كان البريد مسجّلاً أم لا */
const GENERIC_OK = { ok: true, message: "لو هذا البريد مسجّل، وصلته رسالة استرجاع الآن" };

export async function POST(request: Request) {
  // نفس حد التسجيل — يمنع إغراق بريد أحدهم برسائل استرجاع متكررة
  if (!(await checkRegisterRateLimit(clientIp(request)))) {
    return Response.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email) return Response.json(GENERIC_OK);

  const teacher = await findTeacherByUsername(email);
  if (teacher) {
    const token = await createPasswordReset(teacher.id);
    const origin = new URL(request.url).origin;
    const link = `${origin}/reset-password?token=${token}`;
    await sendMail(
      email,
      "استرجاع كلمة المرور — حلقات",
      `<div dir="rtl" style="font-family:sans-serif"><p>وصلنا طلب استرجاع كلمة مرور حسابك بحلقات.</p><p><a href="${link}">اضغط هنا لتعيين كلمة مرور جديدة</a> (صالح ساعة واحدة).</p><p>لو ما طلبت هذا، تجاهل الرسالة.</p></div>`,
    );
  }

  return Response.json(GENERIC_OK);
}
