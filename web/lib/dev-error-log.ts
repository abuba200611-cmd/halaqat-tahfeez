import "server-only";

import { db } from "./db";

/*
  M3 — سجل أخطاء الخادم لقسم «الصحة» بلوحة المطوّر. الأخطاء اليوم لا
  تُخزَّن في شيء؛ هذا الخزان الصغير يلتقط ما يُراد فحصه من مسارات
  حساسة (أوراد، حضور، تلاوات، توزيع، انضمام جامع). فشل التسجيل لا
  يُفشل الطلب أبداً — نكتفي بطباعة بالسجل.
*/

export type ServerErrorEntry = {
  id: number;
  at: string;
  scope: string;
  message: string;
};

/** احتمال التنظيف عند كل إدراج — يكفي أن يمسح أحدها الجدول دورياً */
const CLEANUP_SAMPLE_RATE = 0.05;
const RETENTION_DAYS = 30;

export async function logServerError(scope: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? null) : null;
  try {
    await db().sql`
      INSERT INTO dev_error_log (scope, message, stack)
      VALUES (${scope}, ${message.slice(0, 2000)}, ${stack})
    `;
    if (Math.random() < CLEANUP_SAMPLE_RATE) {
      await db().sql`
        DELETE FROM dev_error_log WHERE at < now() - (${RETENTION_DAYS} * interval '1 day')
      `;
    }
  } catch (logError) {
    console.error("dev-error-log: failed to record", scope, logError);
  }
}

/** آخر ١٠٠ خطأ — الأحدث أولاً */
export async function listRecentServerErrors(limit = 100): Promise<ServerErrorEntry[]> {
  const rows = await db().sql`
    SELECT id, at, scope, message FROM dev_error_log ORDER BY id DESC LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    at: new Date(row.at as string).toISOString(),
    scope: row.scope as string,
    message: row.message as string,
  }));
}
