import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { getMosque, getHalaqah } from "@/lib/mosque/db";
import { getHalaqahStage, setHalaqahStage } from "@/lib/halaqah-stage-db";
import { parseStage } from "@/lib/halaqah-stage";
import { logSecurityEvent } from "@/lib/audit-log";

/**
 * مدير الجامع يحدّد فئة حلقة من حلقات جامعه (001 US1، FR-002): الحلقة
 * يجب أن تتبع هذا الجامع وإلا 404 متطابقة مع غير الموجودة — لا كشف أي
 * شيء عن حلقات الجوامع الأخرى. كل تغيير يُسجَّل بحدث أمان mosque_admin.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; halaqahId: string }> }) {
  const { id, halaqahId: rawHalaqahId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const halaqahId = parsePositiveIntParam(rawHalaqahId);
  if (mosqueId === null || halaqahId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  const halaqah = await getHalaqah(halaqahId);
  if (!halaqah || halaqah.mosqueId !== mosqueId) {
    return Response.json({ error: "الحلقة غير موجودة" }, { status: 404 });
  }

  if (!(await checkRateLimit(`halaqah-stage:${mosqueId}`, 60, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { stage?: unknown };
  let stage: ReturnType<typeof parseStage>;
  try {
    stage = parseStage(body.stage);
  } catch {
    return Response.json({ error: "قيمة الفئة غير صحيحة" }, { status: 400 });
  }

  const from = await getHalaqahStage(halaqahId);
  await setHalaqahStage(halaqahId, stage);
  await logSecurityEvent({
    event: "halaqah.stage_change",
    actorKind: "mosque_admin",
    actorId: (await currentMosqueAdmin())?.id ?? null,
    details: { mosqueId, halaqahId, from, to: stage },
  });

  return Response.json({ ok: true, stage });
}
