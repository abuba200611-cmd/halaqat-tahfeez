import "server-only";

import { db } from "./db";

/**
 * عدّاد معدّل ذرّي واحد لكل استدعاء: إدراج بنافذة زمنية ثابتة أو زيادة
 * العدّاد القائم بـON CONFLICT — لا فحص ثم إدراج منفصلان. أي فشل بالعدّاد
 * يسمح بالمرور (fail-open) حتى لا يعطّل خلل قاعدة البيانات المعلّمين.
 */
export async function checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  try {
    const rows = await db().sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, to_timestamp(${bucket}), 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count
    `;
    return Number(rows[0]?.count ?? 0) <= limit;
  } catch (error) {
    // fail-open عمداً: تعذّر فحص الحدّ ≠ تجاوز الحدّ
    console.error("rate-limit check failed, allowing request", error);
    return true;
  }
}

/** رد موحّد عند تجاوز حدّ المعدّل */
export function rateLimited(): Response {
  return Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 });
}
