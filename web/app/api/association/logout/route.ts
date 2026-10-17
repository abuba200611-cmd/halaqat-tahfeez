import { clearAssociationAdminSession } from "@/lib/association-auth";

export async function POST() {
  await clearAssociationAdminSession();
  return Response.json({ ok: true });
}
