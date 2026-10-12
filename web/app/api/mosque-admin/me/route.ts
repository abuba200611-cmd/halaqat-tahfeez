import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { getMosque } from "@/lib/mosque/db";

export async function GET() {
  const admin = await currentMosqueAdmin();
  if (!admin) return Response.json({ admin: null });

  const mosque = await getMosque(admin.mosqueId);
  return Response.json({ admin: { ...admin, mosqueName: mosque?.name ?? "" } });
}
