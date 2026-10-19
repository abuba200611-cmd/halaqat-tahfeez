import { checkLoginRateLimit, findTeacherByUsername, recordFailedLoginAttempt } from "@/lib/db";
import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { findParentByEmail, isValidParentEmail, normalizeParentEmail } from "@/lib/parent-db";
import { setParentSessionCookie } from "@/lib/parent-auth";
import { findMosqueAdminByUsername } from "@/lib/mosque/db";
import { setMosqueAdminSessionCookie } from "@/lib/mosque-auth";
import { recordLogin } from "@/lib/activity";
import { peekRateLimit, rateLimited, recordRateLimitHit } from "@/lib/rate-limit";
import { loginFailureKey } from "@/lib/login-key";
import { loginRequestStatus } from "@/lib/mosque-registration-db";
import { loginStatusMessage } from "@/lib/mosque-registration";

/*
  M5 — صفحة الدخول الموحّدة /login: نموذج واحد (بريد/اسم مستخدم + كلمة
  مرور) يجرّب المُصدِّقات القديمة نفسها بترتيب ثابت: معلّم ← مدير جامع ←
  ولي أمر. الطالب خارج الترتيب عمداً — دخوله يحتاج سياق الحلقة (اسم
  المستخدم فريد عالمياً لكن صفحته تخصّ الطالب)، فالصفحة تعرض رابط
  «دخول الطالب» إلى /student. عند التطابق تُضبط كوكي ذلك النوع القائم
  نفسه — لا جلسة جديدة ولا كلمات مرور جديدة.

  لا عدّ للحسابات: أي فشل (غير موجود / كلمة مرور خاطئة / حساب معلّم موقوف)
  يرجع الرسالة والحالة نفسيهما تماماً، والفحوص كلها تجري دوماً بالترتيب
  نفسه فلا يميّز التوقيتُ الحالةَ.
*/

const GENERIC_LOGIN_ERROR = "البريد الإلكتروني أو كلمة المرور غير صحيحة";
const NO_ACCOUNT_MESSAGE = "ما عندك حساب بهذا البريد";

/** أول عنوان بترويسة x-forwarded-for، أو "unknown" محلياً بلا بروكسي — نفس نمط بقية مسارات الدخول */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await checkLoginRateLimit(ip))) {
    return Response.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const identifier = String(body.identifier ?? body.username ?? body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!identifier || !password) {
    return Response.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
  }

  // سقف إضافي لكل معرّف على المحاولات الفاشلة فقط — نفس نمط دخول المعلّم
  const idLimitKey = loginFailureKey("unified-login", ip, identifier);
  if (!(await peekRateLimit(idLimitKey, 10, 900))) {
    return rateLimited();
  }

  const fail = async (noAccount = false) => {
    await recordRateLimitHit(idLimitKey, 900);
    await recordFailedLoginAttempt(ip);
    // لا حساب بالمعرّف عند أي دور: رسالة صريحة (قرار المالك) تحوّل لإنشاء حساب
    if (noAccount) {
      return Response.json({ error: NO_ACCOUNT_MESSAGE, code: "no_account", email: identifier }, { status: 404 });
    }
    return Response.json({ error: GENERIC_LOGIN_ERROR }, { status: 401 });
  };

  // ١) المعلّم — بريده في عمود username القديم
  const teacher = await findTeacherByUsername(identifier);
  if (teacher && verifyPassword(password, teacher.passwordHash)) {
    // حساب موقوف: كلمة المرور صحيحة لكن الدخول ممنوع — رسالة موحّدة مع بقية
    // الفشل حتى لا يكشف هذا المسار وجود الحساب (مسار المعلّم الأصلي وحده
    // يخبره بسبب المنع صراحة بعد أن أثبت الدخول هناك)
    if (teacher.deactivatedAt) return fail();
    await setSessionCookie(teacher.id);
    await recordLogin({ role: "teacher", teacherId: teacher.id });
    return Response.json({
      kind: "teacher",
      redirect: "/",
      teacher: {
        id: teacher.id,
        username: teacher.username,
        teacherName: teacher.teacherName,
        halaqahId: teacher.halaqahId,
        halaqahName: teacher.halaqahName,
        role: teacher.role,
        emailVerified: teacher.emailVerified,
      },
    });
  }

  // ٢) مدير الجامع — اسم مستخدم (قد يكون بريداً)
  const mosqueAdmin = await findMosqueAdminByUsername(identifier);
  if (mosqueAdmin && verifyPassword(password, mosqueAdmin.passwordHash)) {
    await setMosqueAdminSessionCookie(mosqueAdmin.id);
    await recordLogin({ role: "mosque_admin", adminId: mosqueAdmin.id });
    return Response.json({ kind: "mosque_admin", redirect: `/mosque/${mosqueAdmin.mosqueId}` });
  }

  // ٣) ولي الأمر — بريد إلكتروني فقط
  const email = normalizeParentEmail(identifier);
  let parentExists = false;
  if (isValidParentEmail(email)) {
    const parent = await findParentByEmail(email);
    parentExists = parent !== null;
    if (parent && verifyPassword(password, parent.passwordHash)) {
      await setParentSessionCookie(parent.id);
      await recordLogin({ role: "parent", parentId: parent.id });
      return Response.json({ kind: "parent", redirect: "/parent" });
    }
  }

  // ٤) طلب تسجيل جامع معلّق/مرفوض ببيانات الدخول نفسها — رسالة حالته لا الخطأ العام
  const registration = await loginRequestStatus(identifier, password);
  if (registration) {
    return Response.json(
      { error: loginStatusMessage(registration.status, registration.reason), code: `registration_${registration.status}` },
      { status: 403 },
    );
  }

  return fail(!teacher && !mosqueAdmin && !parentExists);
}
