import { clearParentSessionCookie } from "@/lib/parent-auth";

export async function POST() {
  await clearParentSessionCookie();
  return Response.json({ ok: true });
}
