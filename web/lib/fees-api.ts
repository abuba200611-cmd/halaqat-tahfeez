import "server-only";

import { featureGate, paramNotFound, parsePositiveIntParam } from "@/lib/mosque/api-gate";
import { currentMosqueActor, type MosqueActor } from "@/lib/mosque/actor";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { FEES_FEATURE_KEY } from "@/lib/fees";

/*
  مقدّمة مشتركة لمسارات الرسوم تحت /api/mosques/[id]/fees: معرّف الجامع من
  المسار ← بوابة الميزة (401 بلا صلاحية، 404 معطّلة/غير موجود) — مدير الجامع
  لجامعه فقط (canAccessMosque) والمشرف العام. معرّفات الأبناء (خطة/مستحق)
  تُقيَّد بـ mosque_id هذا في طبقة البيانات، فلا يصل معرّف جامع آخر.
*/

export type FeesContext = { mosqueId: number };

export async function feesGate(rawMosqueId: string): Promise<FeesContext | Response> {
  const mosqueId = parsePositiveIntParam(rawMosqueId);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEES_FEATURE_KEY);
  if (gate) return gate;
  return { mosqueId };
}

/** حدّ الكتابة: ٢٠٠ عملية/ساعة لكل منفّذ. يرجع Response عند التجاوز أو الفاعل عند المرور. */
export async function feesWriteGuard(mosqueId: number): Promise<MosqueActor | Response> {
  const actor = await currentMosqueActor();
  if (!(await checkRateLimit(`fees-write:${actor.kind}:${actor.id ?? mosqueId}`, 200, 3600))) return rateLimited();
  return actor;
}

/** معرّف موجب من معامل مسار، أو Response 404 */
export function idParam(raw: string): number | Response {
  return parsePositiveIntParam(raw) ?? paramNotFound();
}
