import { currentAssociationAdmin } from "@/lib/association-auth";
import { getAssociation } from "@/lib/association-db";

export async function GET() {
  const admin = await currentAssociationAdmin();
  if (!admin) return Response.json({ admin: null });

  const association = await getAssociation(admin.associationId);
  return Response.json({
    admin: { id: admin.id, username: admin.username, associationId: admin.associationId },
    association: association ? { id: association.id, name: association.name, city: association.city } : null,
  });
}
