import "server-only";

import { after } from "next/server";

import { db } from "./db";
import { logServerError } from "./dev-error-log";
import { isFeatureEnabled } from "./mosque/db";
import {
  MAX_ATTEMPTS,
  buildWebhookBody,
  generateWebhookSecret,
  nextDelaySeconds,
  sendWebhook,
  type WebhookEvent,
} from "./webhooks";

/*
  صندوق الويب هوكس الصادر. enqueue يكتب صفاً لكل نقطة فعّالة مشتركة بالحدث
  (لا شيء إن كانت الميزة مغلقة للجامع)؛ deliverDue يحجز الصفوف المستحقة بـ
  FOR UPDATE SKIP LOCKED مع «إيجار» ١٠ دقائق (يتجاوز تعارض تشغيلين)، يرسل،
  ثم يسجّل النتيجة: delivered، أو إعادة جدولة بتراجع أُسّي، أو failed بعد
  استنفاد المحاولات. كل صف مقيَّد بجامع نقطته.
*/

export const MAX_ENDPOINTS = 5;
export const INTEGRATIONS_FEATURE_KEY = "integrations";

export type EndpointInfo = {
  id: number;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
  pending: number;
  failed: number;
};

export async function listEndpoints(mosqueId: number): Promise<EndpointInfo[]> {
  const rows = await db().sql`
    SELECT e.id, e.url, e.events, e.active, e.created_at,
           (SELECT count(*)::int FROM webhook_outbox o WHERE o.endpoint_id = e.id AND o.status = 'pending') AS pending,
           (SELECT count(*)::int FROM webhook_outbox o WHERE o.endpoint_id = e.id AND o.status = 'failed') AS failed
    FROM webhook_endpoints e WHERE e.mosque_id = ${mosqueId} ORDER BY e.id DESC
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    url: r.url as string,
    events: (r.events as string[]) ?? [],
    active: r.active === true,
    createdAt: String(r.created_at),
    pending: Number(r.pending ?? 0),
    failed: Number(r.failed ?? 0),
  }));
}

export async function countEndpoints(mosqueId: number): Promise<number> {
  const rows = await db().sql`SELECT count(*)::int AS n FROM webhook_endpoints WHERE mosque_id = ${mosqueId}`;
  return Number(rows[0]?.n ?? 0);
}

/** ينشئ نقطة ويعيد السرّ مرة واحدة (يبقى مخزّناً للتوقيع لكن لا يُعرض ثانية) */
export async function createEndpoint(
  mosqueId: number,
  url: string,
  events: string[],
): Promise<{ id: number; secret: string }> {
  const secret = generateWebhookSecret();
  const rows = await db().sql`
    INSERT INTO webhook_endpoints (mosque_id, url, secret, events)
    VALUES (${mosqueId}, ${url}, ${secret}, ${events})
    RETURNING id
  `;
  return { id: Number(rows[0].id), secret };
}

export async function setEndpointActive(mosqueId: number, endpointId: number, active: boolean): Promise<boolean> {
  const rows = await db().sql`
    UPDATE webhook_endpoints SET active = ${active}
    WHERE id = ${endpointId} AND mosque_id = ${mosqueId} RETURNING id
  `;
  return rows.length > 0;
}

export async function deleteEndpoint(mosqueId: number, endpointId: number): Promise<boolean> {
  const rows = await db().sql`
    DELETE FROM webhook_endpoints WHERE id = ${endpointId} AND mosque_id = ${mosqueId} RETURNING id
  `;
  return rows.length > 0;
}

export async function endpointBelongsToMosque(mosqueId: number, endpointId: number): Promise<boolean> {
  const rows = await db().sql`
    SELECT 1 FROM webhook_endpoints WHERE id = ${endpointId} AND mosque_id = ${mosqueId}
  `;
  return rows.length > 0;
}

/**
 * يصفّ الحدث لكل نقطة فعّالة مشتركة (أو بلا قائمة أحداث = كل الأحداث). لا شيء
 * إن كانت الميزة مغلقة للجامع. يعيد معرّفات صفوف الصندوق.
 */
export async function enqueueWebhookEvent(
  mosqueId: number,
  event: WebhookEvent,
  payload: unknown,
  onlyEndpointId?: number,
): Promise<number[]> {
  if (!(await isFeatureEnabled(mosqueId, INTEGRATIONS_FEATURE_KEY))) return [];
  const json = JSON.stringify(payload ?? {});
  const rows = await db().sql`
    INSERT INTO webhook_outbox (endpoint_id, event, payload)
    SELECT e.id, ${event}, ${json}::jsonb
    FROM webhook_endpoints e
    WHERE e.mosque_id = ${mosqueId} AND e.active = TRUE
      AND (cardinality(e.events) = 0 OR ${event} = ANY(e.events))
      AND (${onlyEndpointId ?? null}::int IS NULL OR e.id = ${onlyEndpointId ?? null}::int)
    RETURNING id
  `;
  return rows.map((r) => Number(r.id));
}

/**
 * يصفّ حدثاً حقيقياً من مسار عمل ويجدول تسليماً فورياً (best-effort) عبر after().
 * لا يرمي أبداً. الجامع مغلق الميزة/بلا نقطة مشتركة = استعلام واحد رخيص ثم عودة.
 * الـcron يبقى مسار إعادة المحاولة.
 */
async function emitEvent(
  scope: { mosqueId: number } | { halaqahId: number },
  event: WebhookEvent,
  payload: unknown,
): Promise<void> {
  try {
    const rows =
      "mosqueId" in scope
        ? await db().sql`
            SELECT ${scope.mosqueId}::int AS mosque_id,
                   EXISTS (
                     SELECT 1 FROM webhook_endpoints e
                     WHERE e.mosque_id = ${scope.mosqueId} AND e.active = TRUE
                       AND (cardinality(e.events) = 0 OR ${event} = ANY(e.events))
                   ) AS subscribed
          `
        : await db().sql`
            SELECT h.mosque_id,
                   EXISTS (
                     SELECT 1 FROM webhook_endpoints e
                     WHERE e.mosque_id = h.mosque_id AND e.active = TRUE
                       AND (cardinality(e.events) = 0 OR ${event} = ANY(e.events))
                   ) AS subscribed
            FROM halaqahs h WHERE h.id = ${scope.halaqahId}
          `;
    const row = rows[0];
    if (!row || row.mosque_id == null || row.subscribed !== true) return;

    const mosqueId = Number(row.mosque_id);
    const ids = await enqueueWebhookEvent(mosqueId, event, payload);
    if (ids.length === 0) return;

    try {
      after(async () => {
        try {
          await deliverDueWebhooks({ ids, mosqueId });
        } catch (error) {
          await logServerError("webhooks:deliver-now", error);
        }
      });
    } catch {
      // خارج سياق طلب: يبقى الصف في الصندوق ويلتقطه الـcron
    }
  } catch (error) {
    await logServerError(`webhooks:emit:${event}`, error).catch(() => {});
  }
}

/** يصدر حدثاً لجامع معروف */
export function emitMosqueEvent(mosqueId: number, event: WebhookEvent, payload: unknown): Promise<void> {
  return emitEvent({ mosqueId }, event, payload);
}

/** يصدر حدثاً عبر حلقة (يُحلّ جامعها داخل الاستعلام نفسه؛ حلقة بلا جامع = لا شيء) */
export function emitHalaqahEvent(halaqahId: number, event: WebhookEvent, payload: unknown): Promise<void> {
  return emitEvent({ halaqahId }, event, payload);
}

export type DeliverySummary = { claimed: number; delivered: number; retried: number; failed: number };

/** يسلّم المستحق من الصندوق. mosqueId اختياري لحصر التشغيل (زرّ الاختبار). */
export async function deliverDueWebhooks(opts: { limit?: number; mosqueId?: number; ids?: number[] } = {}): Promise<DeliverySummary> {
  const limit = Math.min(Math.max(opts.limit ?? 25, 1), 100);
  const summary: DeliverySummary = { claimed: 0, delivered: 0, retried: 0, failed: 0 };

  const claimed = await db().sql`
    UPDATE webhook_outbox SET attempts = attempts + 1, next_attempt_at = now() + interval '10 minutes'
    WHERE id IN (
      SELECT o.id FROM webhook_outbox o
      JOIN webhook_endpoints e ON e.id = o.endpoint_id
      WHERE o.status = 'pending' AND o.next_attempt_at <= now()
        AND (${opts.mosqueId ?? null}::int IS NULL OR e.mosque_id = ${opts.mosqueId ?? null}::int)
        AND (${opts.ids ?? null}::int[] IS NULL OR o.id = ANY(${opts.ids ?? null}::int[]))
      ORDER BY o.next_attempt_at
      LIMIT ${limit}
      FOR UPDATE OF o SKIP LOCKED
    )
    RETURNING id, endpoint_id, event, payload, attempts, created_at
  `;
  summary.claimed = claimed.length;
  if (claimed.length === 0) return summary;

  const endpointIds = [...new Set(claimed.map((r) => Number(r.endpoint_id)))];
  const endpointRows = await db().sql`
    SELECT id, mosque_id, url, secret, active FROM webhook_endpoints WHERE id = ANY(${endpointIds})
  `;
  const endpoints = new Map(endpointRows.map((r) => [Number(r.id), r]));
  const flagCache = new Map<number, boolean>();

  for (const row of claimed) {
    const id = Number(row.id);
    const attempts = Number(row.attempts);
    const endpoint = endpoints.get(Number(row.endpoint_id));

    let enabled = false;
    if (endpoint && endpoint.active === true) {
      const mosqueId = Number(endpoint.mosque_id);
      if (!flagCache.has(mosqueId)) flagCache.set(mosqueId, await isFeatureEnabled(mosqueId, INTEGRATIONS_FEATURE_KEY));
      enabled = flagCache.get(mosqueId) === true;
    }
    if (!endpoint || !enabled) {
      await db().sql`
        UPDATE webhook_outbox SET status = 'failed', last_error = ${"النقطة معطّلة أو الميزة مغلقة"}
        WHERE id = ${id}
      `;
      summary.failed += 1;
      continue;
    }

    const body = buildWebhookBody(
      row.event as string,
      row.payload,
      id,
      new Date(String(row.created_at)).toISOString(),
    );
    const result = await sendWebhook({
      url: endpoint.url as string,
      secret: endpoint.secret as string,
      event: row.event as string,
      body,
      deliveryId: id,
    });

    if (result.ok) {
      await db().sql`
        UPDATE webhook_outbox SET status = 'delivered', delivered_at = now(), last_error = NULL WHERE id = ${id}
      `;
      summary.delivered += 1;
      continue;
    }

    const delay = nextDelaySeconds(attempts);
    const error = result.error ?? "فشل الإرسال";
    if (delay === null || attempts >= MAX_ATTEMPTS) {
      await db().sql`UPDATE webhook_outbox SET status = 'failed', last_error = ${error} WHERE id = ${id}`;
      summary.failed += 1;
    } else {
      await db().sql`
        UPDATE webhook_outbox SET last_error = ${error}, next_attempt_at = now() + (${delay} * interval '1 second')
        WHERE id = ${id}
      `;
      summary.retried += 1;
    }
  }
  return summary;
}
