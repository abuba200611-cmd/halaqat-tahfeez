import { clearAdminCookie } from "@/lib/mosque/admin-auth";

export async function POST() {
  await clearAdminCookie();
  return Response.json({ ok: true });
}
