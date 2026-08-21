import { checkRegisterRateLimit, createEmailVerification, createTeacher, findTeacherByUsername } from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

/** أول عنوان بترويسة x-forwarded-for، أو "unknown" محلياً بلا بروكسي */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  if (!(await checkRegisterRateLimit(clientIp(request)))) {
    return Response.json(
      { error: "محاولات كثيرة، حاول بعد شوي" },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // نخزّن البريد بعمود "username" القديم نفسه لتفادي ترحيل مخطط قاعدة البيانات —
  // هو فعلياً بريد إلكتروني الآن من واجهة المستخدم وطبقة التحقق فقط.
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const halaqahName = String(body.halaqahName ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
    return Response.json({ error: "أدخل بريداً إلكترونياً صحيحاً" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "كلمة المرور ٨ أحرف فأكثر" }, { status: 400 });
  }
  if (await findTeacherByUsername(username)) {
    return Response.json({ error: "هذا البريد مسجّل من قبل" }, { status: 409 });
  }

  const id = await createTeacher(username, hashPassword(password), halaqahName);
  await setSessionCookie(id);

  const token = await createEmailVerification(id);
  const origin = new URL(request.url).origin;
  const link = `${origin}/verify-email?token=${token}`;
  await sendMail(
    username,
    "أكّد بريدك — حلقات",
    `<div dir="rtl" style="font-family:sans-serif"><p>أهلاً، أكمل تسجيلك بحلقات بتأكيد بريدك.</p><p><a href="${link}">اضغط هنا لتأكيد البريد</a> (صالح ٢٤ ساعة).</p></div>`,
  );

  return Response.json({
    teacher: { id, username, halaqahName: halaqahName || "حلقتي", emailVerified: false },
  });
}
