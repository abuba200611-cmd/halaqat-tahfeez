import "server-only";

import { bearerToken, hasScope, type ApiScope } from "./api-keys";
import { verifyApiKey, type VerifiedApiKey } from "./api-keys-db";
import { clientIp } from "./client-ip";
import { isFeatureEnabled } from "./mosque/db";
import { checkRateLimit, peekRateLimit, recordRateLimitHit } from "./rate-limit";

/*
  بوابة /api/v1/*: مفتاح Bearer ← نطاق ← ميزة «التكاملات» مفعّلة للجامع
  ← حدّ معدّل لكل مفتاح. الجامع يؤخذ من المفتاح وحده (لا معامل جامع في
  الطلب) فلا يمكن لأي مفتاح الوصول لبيانات جامع آخر.
  ترتيب الردود: 429 (فشل مصادقة متكرر من نفس IP) ← 401 (مفتاح مفقود/غلط/
  مسحوب) ← 404 (الميزة مغلقة: المسار «غير موجود» كأنه لم يُنشر) ←
  403 (نطاق ناقص) ← 429 (حدّ المفتاح).
*/

export const KEY_RATE_LIMIT = 120; // طلب/دقيقة لكل مفتاح
export const KEY_RATE_WINDOW = 60;
export const FAIL_RATE_LIMIT = 30; // محاولة فاشلة/دقيقة لكل IP
export const INTEGRATIONS_FEATURE = "integrations";

export type V1Deps = {
  verify: (token: string) => Promise<VerifiedApiKey | null>;
  featureEnabled: (mosqueId: number) => Promise<boolean>;
  keyRateOk: (keyId: number) => Promise<boolean>;
  failuresAllowed: (ip: string) => Promise<boolean>;
  recordFailure: (ip: string) => Promise<void>;
};

const defaultDeps: V1Deps = {
  verify: verifyApiKey,
  featureEnabled: (mosqueId) => isFeatureEnabled(mosqueId, INTEGRATIONS_FEATURE),
  keyRateOk: (keyId) => checkRateLimit(`v1-key:${keyId}`, KEY_RATE_LIMIT, KEY_RATE_WINDOW),
  failuresAllowed: (ip) => peekRateLimit(`v1-fail:${ip}`, FAIL_RATE_LIMIT, 60),
  recordFailure: (ip) => recordRateLimitHit(`v1-fail:${ip}`, 60),
};

const BASE_HEADERS = { "Cache-Control": "no-store" };

export function v1Error(status: number, code: string, message: string, extra: Record<string, string> = {}): Response {
  return Response.json({ error: { code, message } }, { status, headers: { ...BASE_HEADERS, ...extra } });
}

export type V1Auth = { mosqueId: number; keyId: number };

export async function authenticateV1(
  request: Request,
  scope: ApiScope,
  deps: V1Deps = defaultDeps,
): Promise<V1Auth | Response> {
  const ip = clientIp(request);
  if (!(await deps.failuresAllowed(ip))) {
    return v1Error(429, "rate_limited", "محاولات كثيرة، حاول لاحقاً", { "Retry-After": "60" });
  }

  const token = bearerToken(request.headers.get("authorization"));
  const key = token ? await deps.verify(token) : null;
  if (!key) {
    await deps.recordFailure(ip);
    return v1Error(401, "unauthorized", "مفتاح API مفقود أو غير صالح", { "WWW-Authenticate": "Bearer" });
  }

  if (!(await deps.featureEnabled(key.mosqueId))) return v1Error(404, "not_found", "غير موجود");

  if (!hasScope(key.scopes, scope)) {
    return v1Error(403, "insufficient_scope", `المفتاح لا يملك النطاق ${scope}`);
  }

  if (!(await deps.keyRateOk(key.id))) {
    return v1Error(429, "rate_limited", "تجاوزت حدّ الطلبات، حاول لاحقاً", { "Retry-After": "60" });
  }
  return { mosqueId: key.mosqueId, keyId: key.id };
}

// ————— الترقيم —————

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

/** limit من الاستعلام: افتراضي ٥٠، أقصى ٢٠٠؛ قيمة غير صالحة = null (400) */
export function parseLimit(raw: string | null): number | null {
  if (raw === null || raw === "") return DEFAULT_LIMIT;
  if (!/^[0-9]{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_LIMIT ? n : null;
}

/** مؤشر معتم: base64url لمصفوفة JSON. التحقق من شكله على كل مسار. */
export function encodeCursor(parts: readonly (string | number)[]): string {
  return Buffer.from(JSON.stringify(parts)).toString("base64url");
}

export function decodeCursor(raw: string | null): (string | number)[] | null | "invalid" {
  if (raw === null || raw === "") return null;
  if (raw.length > 200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return "invalid";
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 4) return "invalid";
    if (!parsed.every((p) => typeof p === "string" || typeof p === "number")) return "invalid";
    return parsed as (string | number)[];
  } catch {
    return "invalid";
  }
}

export const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

export function badRequest(message: string): Response {
  return v1Error(400, "bad_request", message);
}

export function listResponse(data: unknown[], nextCursor: string | null): Response {
  return Response.json({ data, next_cursor: nextCursor }, { headers: BASE_HEADERS });
}
