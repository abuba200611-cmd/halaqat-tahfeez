import {
  checkRegisterRateLimit,
  createEmailVerification,
  createHalaqahWithSupervisor,
  findTeacherById,
  findTeacherByUsername,
  joinHalaqahAsAssistant,
} from "@/lib/db";
import { randomBytes } from "node:crypto";
import { hashPassword, setSessionCookie } from "@/lib/auth";
import { clearGoogleHandoffCookie, readGoogleHandoff } from "@/lib/google-handoff";
import { recordLogin } from "@/lib/activity";
import { sendMail } from "@/lib/mail";
import { hasPrivacyConsent, privacyConsentRequired } from "@/lib/privacy-consent-shared";
import { recordPrivacyConsent } from "@/lib/privacy-consent";

/** أول عنوان بترويسة x-forwarded-for، أو "unknown" محلياً بلا بروكسي */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

const REGISTER_MESSAGE = "تم إنشاء حسابك — أكّد بريدك من الرسالة التي وصلتك";

/**
 * بريد مسجّل مسبقاً: قرار المالك أن يُقال بوضوح (لا رد عام) ليختار المستخدم
 * تسجيل الدخول أو جوجل. التخمين يكبحه حدّ التسجيل لكل IP أعلاه.
 */
function accountExists(email: string): Response {
  return Response.json(
    { error: "هذا البريد مسجّل مسبقاً — سجّل دخولك أو ادخل بحساب جوجل", code: "account_exists", email },
    { status: 409 },
  );
}

export async function POST(request: Request) {
  if (!(await checkRegisterRateLimit(clientIp(request)))) {
    return Response.json(
      { error: "محاولات كثيرة، حاول بعد شوي" },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!hasPrivacyConsent(body)) return privacyConsentRequired();
  // نخزّن البريد بعمود "username" القديم نفسه لتفادي ترحيل مخطط قاعدة البيانات —
  // هو فعلياً بريد إلكتروني الآن من واجهة المستخدم وطبقة التحقق فقط.
  let username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  let teacherName = String(body.teacherName ?? "").trim();
  const halaqahName = String(body.halaqahName ?? "").trim();
  // وجود رمز دعوة معلّم يعني "انضمام لحلقة موجودة" بدل "إنشاء حلقة جديدة"
  const joinCode = String(body.joinCode ?? "").trim();

  // تسجيل بعد جوجل: البريد والاسم يُؤخذان من التسليم الموقّع (كوكي httpOnly)
  // حصراً — ما يرسله العميل في username يُهمَل كلياً فلا يُربط بريد غيره
  const fromGoogle = body.googleHandoff === true;
  if (fromGoogle) {
    const handoff = await readGoogleHandoff();
    if (!handoff) {
      return Response.json(
        { error: "انتهت صلاحية التحقق من جوجل — اضغط «الدخول بحساب جوجل» من جديد", code: "handoff_expired" },
        { status: 400 },
      );
    }
    username = handoff.email;
    teacherName = teacherName || handoff.name;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username)) {
    return Response.json({ error: "أدخل بريداً إلكترونياً صحيحاً" }, { status: 400 });
  }
  if (!fromGoogle && password.length < 8) {
    return Response.json({ error: "كلمة المرور ٨ أحرف فأكثر" }, { status: 400 });
  }
  if (await findTeacherByUsername(username)) {
    return accountExists(username);
  }
  if (fromGoogle && !joinCode && !halaqahName) {
    return Response.json({ error: "أدخل اسم الحلقة" }, { status: 400 });
  }
  // حساب جوجل: كلمة مرور عشوائية لا تُستعمل (دخوله دائماً بجوجل)، والبريد
  // موثّق من جوجل فلا رسالة تفعيل
  const passwordHash = fromGoogle ? randomBytes(32).toString("hex") : hashPassword(password);
  const emailVerified = fromGoogle;

  let id: number;
  if (joinCode) {
    const joined = await joinHalaqahAsAssistant(joinCode, username, passwordHash, emailVerified, teacherName);
    if (joined === null) {
      return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 400 });
    }
    id = joined;
  } else {
    id = await createHalaqahWithSupervisor(username, passwordHash, halaqahName, emailVerified, teacherName);
  }
  await recordPrivacyConsent("teacher", id, clientIp(request));
  await setSessionCookie(id);
  await recordLogin({ role: "teacher", teacherId: id });

  if (fromGoogle) {
    await clearGoogleHandoffCookie();
  } else {
    const token = await createEmailVerification(id);
    const origin = new URL(request.url).origin;
    const link = `${origin}/verify-email?token=${token}`;
    await sendMail(
      username,
      "أكّد بريدك — المعلم",
      `<div dir="rtl" style="font-family:sans-serif"><p>أهلاً، أكمل تسجيلك بالمعلم بتأكيد بريدك.</p><p><a href="${link}">اضغط هنا لتأكيد البريد</a> (صالح ٢٤ ساعة).</p></div>`,
    );
  }

  const teacher = await findTeacherById(id);
  return Response.json({ teacher, message: REGISTER_MESSAGE });
}
