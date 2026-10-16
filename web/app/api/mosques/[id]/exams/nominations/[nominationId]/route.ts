import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { withdrawNomination } from "@/lib/mosque/exams-db";

/** سحب ترشيح بلا نتيجة — نتيجة مسجَّلة لا تُسحب (السجل دراسي) */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; nominationId: string }> }) {
  const { id, nominationId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const nominationIdNum = parsePositiveIntParam(nominationId);
  if (mosqueId === null || nominationIdNum === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const withdrawn = await withdrawNomination(mosqueId, nominationIdNum);
  if (!withdrawn) {
    return Response.json({ error: "الترشيح غير موجود أو مسجَّلة نتيجته" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
