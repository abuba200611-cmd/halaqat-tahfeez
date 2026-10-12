import { clearMosqueAdminSession } from "@/lib/mosque-auth";

export async function POST() {
  await clearMosqueAdminSession();
  return Response.json({ ok: true });
}
