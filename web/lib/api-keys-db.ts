import "server-only";

import { db } from "./db";
import { generateApiKey, parseApiKeyPrefix, verifyApiKeyHash, type ApiScope } from "./api-keys";

/*
  مفاتيح API — الوصول للبيانات. كل دالة إدارة مقيّدة بـmosque_id في WHERE
  (لا IDOR عبر معرّف مفتاح جامع آخر). التحقق يبحث بالبادئة ثم يقارن
  التجزئة بزمن ثابت، ولا يعيد أبداً hash ولا المفتاح الصريح.
*/

export const MAX_ACTIVE_KEYS = 10;

export type ApiKeyInfo = {
  id: number;
  name: string;
  prefix: string;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

function rowToInfo(r: Record<string, unknown>): ApiKeyInfo {
  return {
    id: Number(r.id),
    name: r.name as string,
    prefix: r.key_prefix as string,
    scopes: (r.scopes as string[]) ?? [],
    createdAt: String(r.created_at),
    lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
    revokedAt: r.revoked_at ? String(r.revoked_at) : null,
  };
}

export async function listApiKeys(mosqueId: number): Promise<ApiKeyInfo[]> {
  const rows = await db().sql`
    SELECT id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
    FROM mosque_api_keys WHERE mosque_id = ${mosqueId} ORDER BY id DESC
  `;
  return rows.map(rowToInfo);
}

export async function countActiveApiKeys(mosqueId: number): Promise<number> {
  const rows = await db().sql`
    SELECT count(*)::int AS n FROM mosque_api_keys WHERE mosque_id = ${mosqueId} AND revoked_at IS NULL
  `;
  return Number(rows[0]?.n ?? 0);
}

/** ينشئ مفتاحاً ويعيد المفتاح الصريح مرة واحدة — لا يُخزَّن ولا يُسجَّل */
export async function createApiKey(
  mosqueId: number,
  name: string,
  scopes: ApiScope[],
): Promise<{ key: ApiKeyInfo; plaintext: string }> {
  const generated = generateApiKey();
  const rows = await db().sql`
    INSERT INTO mosque_api_keys (mosque_id, name, key_prefix, key_hash, scopes)
    VALUES (${mosqueId}, ${name}, ${generated.prefix}, ${generated.hash}, ${scopes})
    RETURNING id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
  `;
  return { key: rowToInfo(rows[0]), plaintext: generated.plaintext };
}

export async function revokeApiKey(mosqueId: number, keyId: number): Promise<boolean> {
  const rows = await db().sql`
    UPDATE mosque_api_keys SET revoked_at = now()
    WHERE id = ${keyId} AND mosque_id = ${mosqueId} AND revoked_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

export type VerifiedApiKey = { id: number; mosqueId: number; scopes: string[] };

/** مفتاح فعّال مطابق للنص المقدَّم، أو null (مفتاح مسحوب/مجهول/مشوَّه سواء) */
export async function verifyApiKey(plaintext: string): Promise<VerifiedApiKey | null> {
  const prefix = parseApiKeyPrefix(plaintext);
  if (!prefix) return null;
  const rows = await db().sql`
    SELECT id, mosque_id, key_hash, scopes FROM mosque_api_keys
    WHERE key_prefix = ${prefix} AND revoked_at IS NULL
  `;
  for (const row of rows) {
    if (verifyApiKeyHash(plaintext, row.key_hash as string)) {
      const id = Number(row.id);
      // تحديث آخر استخدام مخنوق (مرة كل ٥ دقائق) كي لا نكتب عند كل طلب
      try {
        await db().sql`
          UPDATE mosque_api_keys SET last_used_at = now()
          WHERE id = ${id} AND (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes')
        `;
      } catch {
        // تحديث الإحصاء لا يُفشل طلباً صحيحاً
      }
      return { id, mosqueId: Number(row.mosque_id), scopes: (row.scopes as string[]) ?? [] };
    }
  }
  return null;
}
