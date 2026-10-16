import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque, getMosqueFeatures, listHalaqahs, listMosqueRegistrations } from "@/lib/mosque/db";
import { effectiveFeatures } from "@/lib/mosque/features";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = parsePositiveIntParam((await params).id);
  if (id === null) return paramNotFound();
  if (!(await canAccessMosque(id))) return unauthorized();

  const mosque = await getMosque(id);
  if (!mosque) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  const [halaqahs, registrations, features] = await Promise.all([
    listHalaqahs(id),
    listMosqueRegistrations(id),
    getMosqueFeatures(id),
  ]);
  return Response.json({ mosque, halaqahs, registrations, features: effectiveFeatures(features) });
}
