import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { safeEqual } from "@/lib/safe-equal";

/*
  مفاتيح API للتكاملات — منطق صرف بلا قاعدة بيانات (الوصول في api-keys-db.ts).
  الصيغة: mos_<بادئة ٨ hex>_<عشوائي ٦٤ hex>. نخزّن البادئة وSHA-256 للمفتاح
  كاملاً فقط؛ المفتاح الصريح يُعرض مرة واحدة عند الإنشاء ولا سبيل لاسترجاعه.
  المفتاح عشوائي عالي الإنتروبيا (٢٥٦ بت) فيكفيه SHA-256 بلا ملح/تمديد.
  الرمز hex (لا base64url) حتى لا تلتبس "_" الفاصلة بحرف داخل العشوائي.
*/

export const API_SCOPES = ["students:read", "halaqat:read", "attendance:read", "progress:read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const SCOPE_LABELS: Record<ApiScope, string> = {
  "students:read": "قراءة الطلاب",
  "halaqat:read": "قراءة الحلقات",
  "attendance:read": "قراءة الحضور",
  "progress:read": "قراءة تقدّم الحفظ",
};

export function isApiScope(value: unknown): value is ApiScope {
  return typeof value === "string" && (API_SCOPES as readonly string[]).includes(value);
}

/** نطاقات صالحة فريدة من مدخل حر، أو null لو فارغة/فيها نطاق غير معروف */
export function parseScopes(value: unknown): ApiScope[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const out: ApiScope[] = [];
  for (const item of value) {
    if (!isApiScope(item)) return null;
    if (!out.includes(item)) out.push(item);
  }
  return out;
}

const KEY_PATTERN = /^mos_([0-9a-f]{8})_([0-9a-f]{64})$/;

export type GeneratedApiKey = { plaintext: string; prefix: string; hash: string };

export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const plaintext = `mos_${prefix}_${secret}`;
  return { plaintext, prefix, hash: hashApiKey(plaintext) };
}

/** بادئة مفتاح مقدَّم بصيغته الصحيحة، أو null — تُستعمل للبحث قبل المقارنة */
export function parseApiKeyPrefix(plaintext: string): string | null {
  const match = KEY_PATTERN.exec(plaintext);
  return match ? match[1] : null;
}

/** مقارنة زمن-ثابت لمفتاح مقدَّم مع التجزئة المخزّنة */
export function verifyApiKeyHash(plaintext: string, storedHash: string): boolean {
  if (!KEY_PATTERN.test(plaintext)) return false;
  return safeEqual(hashApiKey(plaintext), storedHash);
}

/** المفتاح من ترويسة Authorization: Bearer … ، أو null */
export function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer +(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export function hasScope(scopes: readonly string[], scope: ApiScope): boolean {
  return scopes.includes(scope);
}
