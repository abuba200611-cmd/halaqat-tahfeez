import "server-only";

import { db } from "../db";
import { getMosqueSetting } from "../mosque-settings-db";
import { isFeatureEnabled } from "../mosque/db";
import { listWhatsappParentsForStudent } from "../parent-db";
import { normalizeSaudiPhone } from "./phone";
import { WHATSAPP_TEMPLATES, type WhatsappTemplateKey } from "./templates";
import { whatsappProvider } from "./whatsapp";

/*
  صندوق صادر واتساب (B1) — كل إرسالة تمرّ من هنا: صف في notifications_outbox
  أولاً (queued) ثم محاولة المزوّد ثم تحديث الصف (sent/failed/skipped).
  التكرار الآمن: ref فريد لكل (حدث، مستلم) — الفهرس الفريد الجزئي بالجدول
  يمنع الصف المكرَّر، وإعادة الحدث نفسه لا ترسل ثانية. السقف اليومي
  (لكل جامع ولكل رقم) يُفحص ويُدرج بجملة واحدة: صفوف اليوم غير المتخطاة
  تُعدّ، وتجاوز السقف يُدرج صف skipped (مسجَّل باللوحة، لا يُحسَب بالسقف).
  لا شيء هنا يرمي أبداً — فشل الإشعار لا يغيّر نتيجة الحدث الأصلي.
*/

// ————— الإعدادات —————

export type WhatsappConfig = {
  /** سقف رسائل اليوم لكل جامع */
  dailyMosqueCap: number;
  /** سقف رسائل اليوم لكل رقم مستلم */
  dailyRecipientCap: number;
};

export const DEFAULT_WHATSAPP_CONFIG: WhatsappConfig = { dailyMosqueCap: 300, dailyRecipientCap: 5 };

function mergeWhatsappConfig(raw: unknown): WhatsappConfig {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const clamp = (value: unknown, fallback: number) => {
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 ? Math.floor(num) : fallback;
  };
  return {
    dailyMosqueCap: clamp(source.dailyMosqueCap, DEFAULT_WHATSAPP_CONFIG.dailyMosqueCap),
    dailyRecipientCap: clamp(source.dailyRecipientCap, DEFAULT_WHATSAPP_CONFIG.dailyRecipientCap),
  };
}

/** سقوف الجامع من mosque_settings (مفتاح "whatsapp") فوق الافتراضيات — لا ترمي أبداً */
export async function getWhatsappConfig(mosqueId: number): Promise<WhatsappConfig> {
  try {
    const raw = await getMosqueSetting(mosqueId, "whatsapp");
    return raw === undefined || raw === null ? DEFAULT_WHATSAPP_CONFIG : mergeWhatsappConfig(raw);
  } catch {
    // إعدادات مفقودة/تالفة ≠ تعطيل الإرسال — الافتراضيات تسري دائماً
    return DEFAULT_WHATSAPP_CONFIG;
  }
}

// ————— الإدراج في الصادر —————

export type WhatsappEnqueueOutcome =
  | { deduped: true }
  | { deduped: false; id: number; status: "queued" | "skipped"; reason: "" | "invalid_phone" | "cap_mosque" | "cap_recipient" };

/**
 * يدرج رسالة بالصادر بجملة واحدة ذرّية: يعدّ صفوف اليوم المحسوبة (جامع
 * ورقم)، يرفض التكرار بفحص ref، ويقرّر الحالة queued أو skipped مع سببها.
 * سباق إدراجين متزامنين لنفس ref يرفضه الفهرس الفريد (23505) ← deduped.
 */
export async function enqueueWhatsapp(input: {
  mosqueId: number;
  toPhone: string;
  template: WhatsappTemplateKey;
  params: Record<string, string>;
  ref: string;
  config?: WhatsappConfig;
}): Promise<WhatsappEnqueueOutcome> {
  const config = input.config ?? (await getWhatsappConfig(input.mosqueId));
  const phone = normalizeSaudiPhone(input.toPhone);
  const toPhone = phone ?? input.toPhone.trim().slice(0, 20);
  const invalid = phone === null;

  try {
    const rows = await db().sql`
      WITH charged AS (
        SELECT
          count(*) FILTER (WHERE mosque_id = ${input.mosqueId}) AS mosque_today,
          count(*) FILTER (WHERE to_phone = ${toPhone}) AS phone_today
        FROM notifications_outbox
        WHERE status != 'skipped' AND created_at >= date_trunc('day', now())
          AND (mosque_id = ${input.mosqueId} OR to_phone = ${toPhone})
      ), ins AS (
        INSERT INTO notifications_outbox (channel, to_phone, template, params, status, error, mosque_id, ref)
        SELECT 'whatsapp', ${toPhone}, ${input.template}, ${JSON.stringify(input.params)}::jsonb,
               CASE
                 WHEN ${invalid}::boolean THEN 'skipped'
                 WHEN charged.mosque_today >= ${config.dailyMosqueCap}::int THEN 'skipped'
                 WHEN charged.phone_today >= ${config.dailyRecipientCap}::int THEN 'skipped'
                 ELSE 'queued'
               END,
               CASE
                 WHEN ${invalid}::boolean THEN 'invalid_phone'
                 WHEN charged.mosque_today >= ${config.dailyMosqueCap}::int THEN 'cap_mosque'
                 WHEN charged.phone_today >= ${config.dailyRecipientCap}::int THEN 'cap_recipient'
                 ELSE ''
               END,
               ${input.mosqueId}, ${input.ref}
        FROM charged
        WHERE NOT EXISTS (SELECT 1 FROM notifications_outbox WHERE ref = ${input.ref})
        RETURNING id, status, error
      )
      SELECT id, status, error FROM ins
    `;
    const row = rows[0];
    if (!row) return { deduped: true };
    return {
      deduped: false,
      id: Number(row.id),
      status: row.status === "skipped" ? "skipped" : "queued",
      reason: (row.error ?? "") as "invalid_phone" | "cap_mosque" | "cap_recipient" | "",
    };
  } catch (error) {
    const err = error as { code?: string; cause?: { code?: string } };
    if ((err.code ?? err.cause?.code) === "23505") return { deduped: true };
    throw error;
  }
}

// ————— الإرسال —————

export type WhatsappDispatch = {
  queued: boolean;
  deduped: boolean;
  skipped: boolean;
  failed: boolean;
  sent: boolean;
  id?: number;
  reason?: string;
};

/** يحدّث صف الصادر بعد محاولة المزوّد — فشل التحديث نفسه يُبتلع */
async function markOutbox(
  id: number,
  status: "sent" | "failed" | "skipped",
  error: string,
): Promise<void> {
  try {
    await db().sql`
      UPDATE notifications_outbox
      SET status = ${status}::text,
          error = ${error},
          sent_at = CASE WHEN ${status}::text = 'sent' THEN now() ELSE sent_at END
      WHERE id = ${id}
    `;
  } catch {
    // الصف يبقى queued — قابل لإعادة الإرسال من اللوحة
  }
}

/** إرسال واحد عبر الصادر: إدراج ← مزوّد ← تحديث. لا ترمي أبداً. */
export async function dispatchWhatsapp(input: {
  mosqueId: number;
  toPhone: string;
  template: WhatsappTemplateKey;
  params: Record<string, string>;
  ref: string;
  config?: WhatsappConfig;
}): Promise<WhatsappDispatch> {
  let outcome: WhatsappEnqueueOutcome;
  try {
    outcome = await enqueueWhatsapp(input);
  } catch {
    // قاعدة بيانات معطلة عن الإدراج: لا صف نُحدّثه ولا مزوّد نستدعيه
    return { queued: false, deduped: false, skipped: false, failed: true, sent: false, reason: "db_error" };
  }
  if (outcome.deduped) return { queued: false, deduped: true, skipped: false, failed: false, sent: false };
  if (outcome.status === "skipped") {
    return { queued: false, deduped: false, skipped: true, failed: false, sent: false, id: outcome.id, reason: outcome.reason };
  }

  const result = await whatsappProvider().send({
    to: normalizeSaudiPhone(input.toPhone) ?? input.toPhone,
    template: input.template,
    params: input.params,
  });
  if (result.skipped) {
    await markOutbox(outcome.id, "skipped", "provider_not_configured");
    return { queued: false, deduped: false, skipped: true, failed: false, sent: false, id: outcome.id, reason: "provider_not_configured" };
  }
  if (result.error) {
    await markOutbox(outcome.id, "failed", result.error);
    return { queued: false, deduped: false, skipped: false, failed: true, sent: false, id: outcome.id, reason: result.error };
  }
  await markOutbox(outcome.id, "sent", "");
  return { queued: false, deduped: false, skipped: false, failed: false, sent: true, id: outcome.id };
}

// ————— الاستهداف: أولياء طالب بعينه —————

/** جامع الحلقة — null إن لم تربط بجامع (الميزة كلها تتطلب الربط) */
async function mosqueIdForHalaqah(halaqahId: number): Promise<number | null> {
  const rows = await db().sql`SELECT mosque_id FROM halaqahs WHERE id = ${halaqahId}`;
  const mosqueId = rows[0]?.mosque_id;
  return typeof mosqueId === "number" ? mosqueId : null;
}

/**
 * يرسل قالب واتساب لكل أولياء طالب بعينه — البوابة والاستهداف والصادر
 * كلها هنا، والمستدعي لا يعرف إلا (الحلقة، الطالب، القالب، معاملاته):
 *   1. الميزة "whatsapp" معطّلة بجامع الحلقة ← لا صفوف صادر إطلاقاً.
 *   2. الاستهداف: المتفقون فقط (whatsapp_opt_in) ممن لهم رقم محفوظ —
 *      لا موافقة لا رسالة، هذا الشرط نفسه في استعلام parent-db.
 *   3. refPrefix هو "الحدث" (مثل ward:12:approved) ويُلحق بمعرّف كل ولي
 *      فيصير مفتاح تكرار آمن لكل (حدث، مستلم).
 * لا ترمي أبداً — تُستدعى داخل after() بعد الرد.
 */
export async function sendWhatsappToParentsOfStudent(input: {
  halaqahId: number;
  studentId: string;
  template: WhatsappTemplateKey;
  paramsFor: (studentName: string) => Record<string, string>;
  refPrefix: string;
  /** يُمرَّر إن عرفه المستدعي أصلاً (مسارات الاختبارات) فيوفّر استعلاماً */
  mosqueId?: number;
}): Promise<void> {
  try {
    const mosqueId = input.mosqueId ?? (await mosqueIdForHalaqah(input.halaqahId));
    if (mosqueId === null) return;
    if (!(await isFeatureEnabled(mosqueId, "whatsapp"))) return;

    const targets = await listWhatsappParentsForStudent(input.halaqahId, input.studentId);
    if (targets.length === 0) return;

    const config = await getWhatsappConfig(mosqueId);
    const template = WHATSAPP_TEMPLATES[input.template];
    await Promise.all(
      targets.map((target) =>
        dispatchWhatsapp({
          mosqueId,
          toPhone: target.phone,
          template: input.template,
          params: input.paramsFor(target.studentName),
          ref: `${template.name}:${input.refPrefix}:${target.parentId}`,
          config,
        }).catch(() => undefined),
      ),
    );
  } catch {
    // فشل الإرسال لا يغيّر نتيجة الحدث الأصلي أبداً
  }
}

// ————— لوحة المطوّر: عرض وإعادة إرسال —————

export type WhatsappOutboxRow = {
  id: number;
  mosqueId: number | null;
  toPhone: string;
  template: string;
  params: Record<string, string>;
  status: "queued" | "sent" | "failed" | "skipped";
  error: string;
  ref: string | null;
  createdAt: string;
  sentAt: string | null;
};

/** آخر صفوف الصادر — اختيارياً بحالة أو جامع، الأحدث أولاً */
export async function listWhatsappOutbox(filter: {
  status?: string;
  mosqueId?: number;
  limit?: number;
}): Promise<WhatsappOutboxRow[]> {
  const status = filter.status ?? null;
  const mosqueId = filter.mosqueId ?? null;
  const limit = filter.limit ?? 200;
  const rows = await db().sql`
    SELECT id, mosque_id, to_phone, template, params, status, error, ref, created_at, sent_at
    FROM notifications_outbox
    WHERE (${status}::text IS NULL OR status = ${status}::text)
      AND (${mosqueId}::int IS NULL OR mosque_id = ${mosqueId}::int)
    ORDER BY created_at DESC, id DESC
    LIMIT ${limit}::int
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    mosqueId: row.mosque_id === null || row.mosque_id === undefined ? null : Number(row.mosque_id),
    toPhone: row.to_phone as string,
    template: row.template as string,
    params: (row.params ?? {}) as Record<string, string>,
    status: row.status as WhatsappOutboxRow["status"],
    error: (row.error ?? "") as string,
    ref: (row.ref ?? null) as string | null,
    createdAt: new Date(row.created_at as string).toISOString(),
    sentAt: row.sent_at ? new Date(row.sent_at as string).toISOString() : null,
  }));
}

export type ResendOutcome = "sent" | "failed" | "skipped" | "not_found" | "not_failed";

/**
 * إعادة إرسال صف فاشل من لوحة المطوّر — الصف نفسه يُعاد استخدامه (ref كما
 * هو). لا يُعاد فحص السقف: الصف محسوب أصلاً بمحاولته الأولى، وهذه يدوية
 * للإصلاح لا تكراراً آلياً.
 */
export async function resendWhatsappOutbox(id: number): Promise<ResendOutcome> {
  const rows = await db().sql`
    SELECT id, status, to_phone, template, params FROM notifications_outbox WHERE id = ${id}
  `;
  const row = rows[0];
  if (!row) return "not_found";
  if (row.status !== "failed") return "not_failed";

  const result = await whatsappProvider().send({
    to: row.to_phone as string,
    template: row.template as WhatsappTemplateKey,
    params: (row.params ?? {}) as Record<string, string>,
  });
  if (result.skipped) {
    await markOutbox(id, "skipped", "provider_not_configured");
    return "skipped";
  }
  if (result.error) {
    await markOutbox(id, "failed", result.error);
    return "failed";
  }
  await markOutbox(id, "sent", "");
  return "sent";
}
