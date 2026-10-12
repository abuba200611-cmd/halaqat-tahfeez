import { findMosqueAdminByUsername } from "@/lib/mosque/db";
import { verifyPassword } from "@/lib/mosque/password";
import { setMosqueSessionCookie } from "@/lib/mosque-auth";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  const admin = await findMosqueAdminByUsername(username);
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return Response.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 });
  }

  await setMosqueSessionCookie(admin.id);
  return Response.json({ ok: true });
}
