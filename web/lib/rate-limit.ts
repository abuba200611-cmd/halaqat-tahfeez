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

/**
 * فحص بلا احتساب: هل العدّاد الحالي دون الحدّ؟ — لحدود "الفشل فقط"
 * (كحدّ الدخول لكل بريد): نتفحّص قبل التحقّق ونحتسب لاحقاً عند الفشل
 * فقط، فلا يستطيع أحد حجب معلّم عن دخوله برشّ محاولات ناجحة/فاشلة.
 */
export async function peekRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  try {
    const rows = await db().sql`
      SELECT count FROM rate_limits
      WHERE key = ${key} AND window_start = to_timestamp(${bucket})
    `;
    return Number(rows[0]?.count ?? 0) < limit;
  } catch (error) {
    // fail-open عمداً: تعذّر فحص الحدّ ≠ تجاوز الحدّ
    console.error("rate-limit peek failed, allowing request", error);
    return true;
  }
}

/** يحتسب محاولة فاشلة على العدّاد الذرّي نفسه — يُستدعى فقط عند الفشل، ويعطب مفتوحاً أيضاً */
export async function recordRateLimitHit(key: string, windowSeconds: number): Promise<void> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
  try {
    await db().sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, to_timestamp(${bucket}), 1)
      ON CONFLICT (key, window_start) DO UPDATE SET count = rate_limits.count + 1
    `;
  } catch (error) {
    console.error("rate-limit record failed, ignoring", error);
  }
}
