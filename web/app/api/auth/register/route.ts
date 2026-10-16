import {
  checkRegisterRateLimit,
  createEmailVerification,
  createHalaqahWithSupervisor,
  findTeacherById,
  findTeacherByUsername,
  joinHalaqahAsAssistant,
} from "@/lib/db";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { recordLogin } from "@/lib/activity";
import { sendMail } from "@/lib/mail";

/** أول عنوان بترويسة x-forwarded-for، أو "unknown" محلياً بلا بروكسي */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** رد موحّد للحالتين (بريد جديد / مسجّل مسبقاً) — لا يكشف وجود الحساب */
const GENERIC_REGISTER_MESSAGE = "إذا كان البريد صالحاً ستصلك رسالة للتفعيل";

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
  const teacherName = String(body.teacherName ?? "").trim();
  const halaqahName = String(body.halaqahName ?? "").trim();
  // وجود رمز دعوة معلّم يعني "انضمام لحلقة موجودة" بدل "إنشاء حلقة جديدة"
  const joinCode = String(body.joinCode ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
    return Response.json({ error: "أدخل بريداً إلكترونياً صحيحاً" }, { status: 400 });
  }
  if (password.length < 8) {
    return Response.json({ error: "كلمة المرور ٨ أحرف فأكثر" }, { status: 400 });
  }
  // بريد مسجّل مسبقاً: نفس الحالة ونفس الرسالة تماماً — لا جلسة ولا بريد ولا
  // أي أثر يميّز الرد عن حالة إنشاء حساب جديد (انظر تقرير الدفعة للتفاصيل)
  if (await findTeacherByUsername(username)) {
    return Response.json({ message: GENERIC_REGISTER_MESSAGE });
  }

  let id: number;
  if (joinCode) {
    const joined = await joinHalaqahAsAssistant(joinCode, username, hashPassword(password), false, teacherName);
    if (joined === null) {
      return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 400 });
    }
    id = joined;
  } else {
    id = await createHalaqahWithSupervisor(username, hashPassword(password), halaqahName, false, teacherName);
  }
  await setSessionCookie(id);
  await recordLogin({ role: "teacher", teacherId: id });

  const token = await createEmailVerification(id);
  const origin = new URL(request.url).origin;
  const link = `${origin}/verify-email?token=${token}`;
  await sendMail(
    username,
    "أكّد بريدك — المعلم",
    `<div dir="rtl" style="font-family:sans-serif"><p>أهلاً، أكمل تسجيلك بالمعلم بتأكيد بريدك.</p><p><a href="${link}">اضغط هنا لتأكيد البريد</a> (صالح ٢٤ ساعة).</p></div>`,
  );

  const teacher = await findTeacherById(id);
  return Response.json({ teacher, message: GENERIC_REGISTER_MESSAGE });
}
