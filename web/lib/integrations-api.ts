import "server-only";

import { featureGate, paramNotFound, parsePositiveIntParam } from "@/lib/mosque/api-gate";
import { currentMosqueActor, type MosqueActor } from "@/lib/mosque/actor";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/*
  مقدّمة مسارات إدارة التكاملات تحت /api/mosques/[id]/integrations: 401 بلا
  صلاحية، 404 لو الميزة مغلقة (الافتراضي) أو الجامع غير موجود — مدير الجامع
  لجامعه فقط والمشرف العام. كل معرّف ابن (مفتاح/نقطة) يُقيَّد بـmosque_id في
  طبقة البيانات.
*/

export const INTEGRATIONS_FEATURE_KEY = "integrations";

export async function integrationsGate(rawMosqueId: string): Promise<{ mosqueId: number } | Response> {
  const mosqueId = parsePositiveIntParam(rawMosqueId);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, INTEGRATIONS_FEATURE_KEY);
  if (gate) return gate;
  return { mosqueId };
}

/** حدّ الكتابة: ٦٠ عملية/ساعة لكل منفّذ */
export async function integrationsWriteGuard(mosqueId: number): Promise<MosqueActor | Response> {
  const actor = await currentMosqueActor();
  if (!(await checkRateLimit(`integrations-write:${actor.kind}:${actor.id ?? mosqueId}`, 60, 3600))) {
    return rateLimited();
  }
  return actor;
}

export function idParam(raw: string): number | Response {
  return parsePositiveIntParam(raw) ?? paramNotFound();
}
