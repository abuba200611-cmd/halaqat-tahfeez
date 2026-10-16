import { clientIp } from "@/lib/client-ip";
import { peekRateLimit, rateLimited, recordRateLimitHit } from "@/lib/rate-limit";
import { findMosqueAdminByUsername } from "@/lib/mosque/db";
import { verifyPassword } from "@/lib/mosque/password";
import { setMosqueAdminSessionCookie } from "@/lib/mosque-auth";
import { recordLogin } from "@/lib/activity";

const MAX_FAILURES = 8;
const WINDOW_SECONDS = 60 * 60;

/**
 * دخول مدير الجامع. حدّ للمحاولات الفاشلة فقط (لكل IP ولكل اسم مستخدم) على
 * عدّاد rate_limits بمفاتيح خاصة به — لا يشارك جدول login_attempts مع دخول
 * المعلّمين حتى لا يحجب فشلُ مدير جامع معلّمين على الشبكة نفسها.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const ipKey = `mosque-admin-login:ip:${clientIp(request)}`;
  const userKey = `mosque-admin-login:user:${username}`;
  if (!(await peekRateLimit(ipKey, MAX_FAILURES, WINDOW_SECONDS)) || !(await peekRateLimit(userKey, MAX_FAILURES, WINDOW_SECONDS))) {
    return rateLimited();
  }

  const admin = await findMosqueAdminByUsername(username);
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    await recordRateLimitHit(ipKey, WINDOW_SECONDS);
    await recordRateLimitHit(userKey, WINDOW_SECONDS);
    return Response.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  await setMosqueAdminSessionCookie(admin.id);
  await recordLogin({ role: "mosque_admin", adminId: admin.id });
  return Response.json({ ok: true });
}
