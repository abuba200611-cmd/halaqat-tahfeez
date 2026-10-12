import { clearMosqueSessionCookie } from "@/lib/mosque-auth";

export async function POST() {
  await clearMosqueSessionCookie();
  return Response.json({ ok: true });
}
