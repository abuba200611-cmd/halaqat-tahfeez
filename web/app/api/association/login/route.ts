import { clientIp } from "@/lib/client-ip";
import { peekRateLimit, rateLimited, recordRateLimitHit } from "@/lib/rate-limit";
import { loginFailureKey } from "@/lib/login-key";
import { findAssociationAdminByUsername, markAssociationAdminLogin } from "@/lib/association-db";
import { setAssociationAdminSessionCookie } from "@/lib/association-auth";
import { verifyPassword } from "@/lib/mosque/password";
import { associationLoginRequestStatus } from "@/lib/association-registration-db";
import { associationLoginStatusMessage } from "@/lib/association-registration";

const MAX_FAILURES = 8;
const WINDOW_SECONDS = 60 * 60;

/**
 * دخول مدير الجمعية. نفس نهج دخول مدير الجامع: حدّ للمحاولات الفاشلة فقط
 * (لكل IP ولكل اسم مستخدم) على عدّاد rate_limits بمفاتيح خاصة به، ورسالة
 * خطأ واحدة لا تفرّق بين اسم مستخدم مجهول وكلمة مرور خاطئة.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const ip = clientIp(request);
  const ipKey = `association-login:ip:${ip}`;
  const userKey = loginFailureKey("association-login:user", ip, username);
  if (!(await peekRateLimit(ipKey, MAX_FAILURES, WINDOW_SECONDS)) || !(await peekRateLimit(userKey, MAX_FAILURES, WINDOW_SECONDS))) {
    return rateLimited();
  }

  const admin = await findAssociationAdminByUsername(username);
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    // بيانات طلب تسجيل معلّق/مرفوض صحيحة؟ رسالة حالته بدل الخطأ العام (لا تُحتسب فشلاً)
    if (!admin) {
      const pending = await associationLoginRequestStatus(username, password);
      if (pending) {
        return Response.json(
          { error: associationLoginStatusMessage(pending.status, pending.reason), code: `registration_${pending.status}` },
          { status: 403 },
        );
      }
    }
    await recordRateLimitHit(ipKey, WINDOW_SECONDS);
    await recordRateLimitHit(userKey, WINDOW_SECONDS);
    return Response.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  await setAssociationAdminSessionCookie(admin.id, admin.sessionVersion);
  await markAssociationAdminLogin(admin.id);
  return Response.json({ ok: true });
}
