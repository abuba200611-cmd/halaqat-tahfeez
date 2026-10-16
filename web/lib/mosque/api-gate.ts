import "server-only";

import { unauthorized } from "./admin-auth";
import { canAccessMosque } from "./access";
import { getMosque, isFeatureEnabled, type MemberKind, type TaskStatus, type TargetKind } from "./db";
import { getFeature } from "./features";

/*
  بوابة مشتركة لمسارات المزايا تحت /api/mosques/[id] — نفس ترتيب فحوص
  مسارات الدماغ: 401 بلا صلاحية، ثم 404 للميزة المعطّلة، ثم 404 للجامع
  غير الموجود. مع مدقّقات المدخلات الصغيرة التي تتكرر بين المسارات.
*/

export async function featureGate(mosqueId: number, featureKey: string): Promise<Response | null> {
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  const nameAr = getFeature(featureKey)?.nameAr ?? "هذه الميزة";
  if (!(await isFeatureEnabled(mosqueId, featureKey))) {
    return Response.json({ error: `${nameAr} غير مفعّل لهذا الجامع` }, { status: 404 });
  }
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  return null;
}

/** نسخة "إحدى المزايا" — مثل أعضاء الجامع الذين تخدمهم الأسر واللجان معاً */
export async function featureGateAny(mosqueId: number, featureKeys: string[]): Promise<Response | null> {
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  for (const key of featureKeys) {
    if (await isFeatureEnabled(mosqueId, key)) {
      if (await getMosque(mosqueId)) return null;
      return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
    }
  }
  return Response.json({ error: "هذه الميزة غير مفعّلة لهذا الجامع" }, { status: 404 });
}

/** رقم موجب من معامل مسار، أو NaN */
export function parseId(value: string): number {
  return Number(value);
}

/** معامل مسار رقمي موجب آمن (أرقام فقط)، أو null */
export function parsePositiveIntParam(value: string | undefined): number | null {
  if (typeof value !== "string" || !/^[0-9]+$/.test(value)) return null;
  const num = Number(value);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

/** 404 لمعامل مسار غير صالح */
export function paramNotFound(): Response {
  return Response.json({ error: "غير موجود" }, { status: 404 });
}

export function isMemberKind(value: unknown): value is MemberKind {
  return value === "student" || value === "member";
}

export function isTargetKind(value: unknown): value is TargetKind {
  return value === "family" || value === "student";
}

export function isTaskStatus(value: unknown): value is TaskStatus {
  return value === "todo" || value === "doing" || value === "done";
}

/** نص مقلّم مقيّد الطول — للحقول القصيرة (أسماء، عناوين) والاختيارية الطويلة */
export function text(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

/** درجة صحيحة ضمن المجال، أو NaN */
export function parseIntIn(value: unknown, min: number, max: number): number {
  // Number("") و Number(null) = 0 — لا تُقبل كدرجة: نرفض كل ما ليس رقماً أو نصاً رقمياً غير فارغ
  if (typeof value === "string" ? value.trim() === "" : typeof value !== "number") return NaN;
  const num = Number(value);
  return Number.isInteger(num) && num >= min && num <= max ? num : NaN;
}
