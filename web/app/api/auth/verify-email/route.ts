import { consumeEmailVerification } from "@/lib/db";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!(await checkRateLimit(`verify-email-ip:${clientIp(request)}`, 30, 15 * 60))) return rateLimited();
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = String(body.token ?? "").trim();
  if (!token) return Response.json({ error: "رمز التأكيد مفقود" }, { status: 400 });

  const teacherId = await consumeEmailVerification(token);
  if (!teacherId) {
    return Response.json({ error: "الرابط منتهي أو مستخدم من قبل" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
