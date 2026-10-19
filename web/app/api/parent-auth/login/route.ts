import { checkLoginRateLimit, recordFailedLoginAttempt } from "@/lib/db";
import { verifyPassword } from "@/lib/auth";
import { setParentSessionCookie } from "@/lib/parent-auth";
import { recordLogin } from "@/lib/activity";
import { findParentByEmail, normalizeParentEmail } from "@/lib/parent-db";
import { peekRateLimit, rateLimited, recordRateLimitHit } from "@/lib/rate-limit";

/** أول عنوان بترويسة x-forwarded-for، أو "unknown" محلياً بلا بروكسي — نفس نمط دخول المعلّم والطالب */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await checkLoginRateLimit(ip))) {
    return Response.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const email = normalizeParentEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  // سقف لكل بريد على المحاولات الفاشلة فقط (نفس نمط المعلّم): فحص قبل التحقّق
  // واحتساب عند فشله حصراً، فلا يقفل أحد حساب ولي الأمر برشّ محاولات ناجحة
  const emailLimitKey = `parent-login:email:${email}`;
  if (!(await peekRateLimit(emailLimitKey, 10, 900))) {
    return rateLimited();
  }

  const parent = await findParentByEmail(email);
  // لا حساب بهذا البريد: رسالة صريحة (قرار المالك) تحوّل لإنشاء حساب،
  // ويُحتسب فاشلاً على الحدّين فلا يصلح مسحاً للبريد
  if (!parent) {
    await recordRateLimitHit(emailLimitKey, 900);
    await recordFailedLoginAttempt(ip);
    return Response.json(
      { error: "ما عندك حساب بهذا البريد", code: "no_account", email },
      { status: 404 },
    );
  }
  if (!verifyPassword(password, parent.passwordHash)) {
    await recordRateLimitHit(emailLimitKey, 900);
    await recordFailedLoginAttempt(ip);
    return Response.json({ error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" }, { status: 401 });
  }

  await setParentSessionCookie(parent.id);
  await recordLogin({ role: "parent", parentId: parent.id });
  return Response.json({ parent: { id: parent.id, name: parent.name, email: parent.email } });
}
