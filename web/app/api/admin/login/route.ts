import { cookies } from "next/headers";
import { checkAdminLoginRateLimit, recordFailedAdminLoginAttempt } from "@/lib/db";
import { safeEqual } from "@/lib/safe-equal";

export const ADMIN_COOKIE = "admin_session";

/** أول عنوان بترويسة x-forwarded-for، أو "unknown" محلياً بلا بروكسي — نفس نمط /api/auth/register */
function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (!(await checkAdminLoginRateLimit(ip))) {
    return Response.json({ error: "محاولات كثيرة، حاول بعد شوي" }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { secret?: unknown };
  const secret = String(body.secret ?? "");
  const expected = process.env.ADMIN_SECRET ?? "";

  if (!expected || !secret || !safeEqual(secret, expected)) {
    await recordFailedAdminLoginAttempt(ip);
    return Response.json({ error: "كلمة السر غير صحيحة" }, { status: 401 });
  }

  const store = await cookies();
  store.set(ADMIN_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ ok: true });
}
