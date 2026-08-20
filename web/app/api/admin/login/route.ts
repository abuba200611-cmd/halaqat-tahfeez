import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";

export const ADMIN_COOKIE = "admin_session";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { secret?: unknown };
  const secret = String(body.secret ?? "");
  const expected = process.env.ADMIN_SECRET ?? "";

  if (!expected || !secret || !safeEqual(secret, expected)) {
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
