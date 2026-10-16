import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque, isFeatureEnabled } from "@/lib/mosque/db";
import { buildMosqueGraph } from "@/lib/mosque/brain-graph";

/** رسم الجامع المعرفي (عُقَد وحوافّ) مبني من بياناته الفعلية — يتبع ميزة "الدماغ" */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await isFeatureEnabled(mosqueId, "brain"))) {
    return Response.json({ error: "الدماغ غير مفعّل لهذا الجامع" }, { status: 404 });
  }
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  return Response.json(await buildMosqueGraph(mosqueId));
}
