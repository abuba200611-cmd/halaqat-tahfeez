import "server-only";

import { db } from "./db";

/*
  قراءة/كتابة إعدادات الجامع من mosque_settings (مفتاح ← JSONB). الجدول
  أُنشئ مع ترحيل الانضباط؛ كل ميزة تحمل مفتاحها (discipline, permits,
  teacher_eval …) وتدمج المخزون فوق افتراضياتها بالكود. القراءة لا ترمي أبداً:
  إعدادات تالفة أو مفقودة ≠ تعطيل الميزة.
*/

export async function getMosqueSetting(mosqueId: number, key: string): Promise<unknown> {
  try {
    const rows = await db().sql`
      SELECT value FROM mosque_settings WHERE mosque_id = ${mosqueId} AND key = ${key}
    `;
    return rows[0]?.value as unknown;
  } catch {
    return undefined;
  }
}

export async function setMosqueSetting(mosqueId: number, key: string, value: unknown): Promise<void> {
  await db().sql`
    INSERT INTO mosque_settings (mosque_id, key, value, updated_at)
    VALUES (${mosqueId}, ${key}, ${JSON.stringify(value)}::jsonb, now())
    ON CONFLICT (mosque_id, key) DO UPDATE SET value = excluded.value, updated_at = now()
  `;
}
