import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { listMosqueHalaqahStudents } from "@/lib/discipline-db";

/*
  A2 — طلاب حلقة من حلقات الجامع (لنموذج الفصل النهائي): محصور بجامع
  مدير الجامع — حلقة من جامع آخر ترجع 404 حتى لو صحيحة.
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "discipline");
  if (gate) return gate;

  const halaqahId = parsePositiveIntParam(new URL(request.url).searchParams.get("halaqahId") ?? "");
  if (halaqahId === null) return Response.json({ error: "حلقة غير صالحة" }, { status: 400 });

  const students = await listMosqueHalaqahStudents(mosqueId, halaqahId);
  if (students === null) return Response.json({ error: "غير موجود" }, { status: 404 });
  return Response.json({ students });
}
