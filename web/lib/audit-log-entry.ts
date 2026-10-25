import { createHash } from "node:crypto";

/*
  بناء صف حدث الأمان — منطق صرف بلا قاعدة بيانات (يُختبر مباشرة).
  الكتابة الفعلية في lib/audit-log.ts.
*/

export type SecurityEvent =
  | "login.success"
  | "login.failure"
  | "admin_login.success"
  | "admin_login.failure"
  | "password.reset"
  | "password.change"
  | "retention.cleanup";

export type SecurityActorKind =
  | "teacher"
  | "student"
  | "parent"
  | "mosque_admin"
  | "association_admin"
  | "developer"
  | "unknown";

export type SecurityAuditInput = {
  event: SecurityEvent;
  actorKind: SecurityActorKind;
  actorId?: string | number | null;
  ip?: string | null;
  /** المعرّف المُدخَل (بريد/اسم مستخدم) — يُخزَّن بصمةً فقط */
  identifier?: string | null;
  details?: Record<string, unknown>;
};

export type SecurityAuditEntry = {
  action: string;
  targetKind: string;
  targetId: string;
  details: Record<string, unknown>;
};

const SENSITIVE_KEY = /pass|secret|token|code|otp|cookie|authorization|hash/i;
const MAX_STRING = 200;
const MAX_KEYS = 20;

/** بصمة قصيرة غير قابلة للعكس عملياً — تكفي لربط محاولات المعرّف نفسه */
export function identifierFingerprint(identifier: string): string {
  return createHash("sha256").update(identifier.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/** يُسقط المفاتيح الحسّاسة ويقصّ النصوص ويحصر القيم في أنواع بسيطة */
export function sanitizeAuditDetails(details: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details).slice(0, MAX_KEYS)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "string") out[key] = value.slice(0, MAX_STRING);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
    else if (value !== undefined) out[key] = JSON.stringify(value).slice(0, MAX_STRING);
  }
  return out;
}

export function buildSecurityAuditEntry(input: SecurityAuditInput): SecurityAuditEntry {
  const details: Record<string, unknown> = sanitizeAuditDetails(input.details ?? {});
  if (input.ip) details.ip = input.ip.slice(0, 64);
  if (input.identifier) details.idFp = identifierFingerprint(input.identifier);
  const id = input.actorId;
  return {
    action: `security.${input.event}`,
    targetKind: input.actorKind,
    targetId: id === null || id === undefined || id === "" ? "-" : String(id).slice(0, 100),
    details,
  };
}
