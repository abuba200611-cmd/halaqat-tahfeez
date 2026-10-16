import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { getCertificate, setCertificateRevoked } from "@/lib/mosque/exams-db";

type RouteContext = { params: Promise<{ id: string; certId: string }> };

/** شهادة واحدة ببياناتها الكاملة — لصفحة الطباعة */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id, certId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const certIdNum = parsePositiveIntParam(certId);
  if (mosqueId === null || certIdNum === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const certificate = await getCertificate(mosqueId, certIdNum);
  if (!certificate) return Response.json({ error: "الشهادة غير موجودة" }, { status: 404 });
  return Response.json({ certificate });
}

/** سحب شهادة (تبطل تحققها) أو إعادة شهادة مسحوبة */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id, certId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const certIdNum = parsePositiveIntParam(certId);
  if (mosqueId === null || certIdNum === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { revoked?: unknown };
  if (typeof body.revoked !== "boolean") return Response.json({ error: "revoked مطلوب (true/false)" }, { status: 400 });

  const certificate = await setCertificateRevoked(mosqueId, certIdNum, body.revoked);
  if (!certificate) return Response.json({ error: "الشهادة غير موجودة" }, { status: 404 });
  return Response.json({ certificate });
}
