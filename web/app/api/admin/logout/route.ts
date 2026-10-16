import { clearAdminCookie } from "@/lib/mosque/admin-auth";
import { devHostGate } from "@/lib/host-gate";

export async function POST() {
  // dev split: من مستضيج عام = 404 كبقية مسارات الأدمن
  const hostGate = await devHostGate();
  if (hostGate) return hostGate;

  await clearAdminCookie();
  return Response.json({ ok: true });
}
