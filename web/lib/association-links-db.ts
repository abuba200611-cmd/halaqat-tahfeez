import "server-only";

import { db } from "@/lib/db";
import {
  authorizeLinkDecision,
  type LinkActor,
  type LinkRecord,
  type LinkRequestedBy,
  type LinkStatus,
} from "@/lib/association-links";

/*
  طبقة بيانات طلبات ربط الجوامع بالجمعيات (جدول mosque_association_links).
  القرار ترانزاكشن واحدة: قفل الطلب FOR UPDATE ← فحص الصلاحية (من الجلسة لا من
  العميل) ← الحالة ← الربط الفعلي mosques.association_id عند القبول ← التدقيق.
*/

export type LinkRow = LinkRecord & {
  mosqueName: string;
  mosqueCity: string;
  associationName: string;
  createdAt: string;
  decidedAt: string | null;
};

function rowToLink(r: Record<string, unknown>): LinkRow {
  const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
  return {
    id: Number(r.id),
    mosqueId: Number(r.mosque_id),
    associationId: Number(r.association_id),
    requestedBy: r.requested_by as LinkRequestedBy,
    status: r.status as LinkStatus,
    mosqueName: (r.mosque_name as string) ?? "",
    mosqueCity: (r.mosque_city as string) ?? "",
    associationName: (r.association_name as string) ?? "",
    createdAt: iso(r.created_at) as string,
    decidedAt: iso(r.decided_at),
  };
}

const SELECT = `
  SELECT l.id, l.mosque_id, l.association_id, l.requested_by, l.status, l.created_at, l.decided_at,
         m.name AS mosque_name, m.city AS mosque_city, a.name AS association_name
  FROM mosque_association_links l
  JOIN mosques m ON m.id = l.mosque_id
  JOIN associations a ON a.id = l.association_id`;

/** الطلبات الموجّهة لمدير هذا الجامع (أرسلتها جمعيات) — المعلّقة أولاً */
export async function listLinksForMosque(mosqueId: number): Promise<LinkRow[]> {
  const result = await db().pool.query(
    `${SELECT} WHERE l.mosque_id = $1 AND l.requested_by = 'association'
     ORDER BY (l.status = 'pending') DESC, l.created_at DESC, l.id DESC LIMIT 100`,
    [mosqueId],
  );
  return result.rows.map(rowToLink);
}

/** كل طلبات هذه الجمعية: ما أرسلته لجوامع وما أرسلته إليها جوامع جديدة */
export async function listLinksForAssociation(associationId: number): Promise<LinkRow[]> {
  const result = await db().pool.query(
    `${SELECT} WHERE l.association_id = $1
     ORDER BY (l.status = 'pending') DESC, l.created_at DESC, l.id DESC LIMIT 200`,
    [associationId],
  );
  return result.rows.map(rowToLink);
}

/** بحث بالاسم عن جوامع لم تُربط بعد بهذه الجمعية — حتى ١٠ نتائج، اسم ومدينة فقط */
export async function searchMosquesForLink(
  associationId: number,
  query: string,
): Promise<{ id: number; name: string; city: string }[]> {
  const needle = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const result = await db().pool.query(
    `SELECT m.id, m.name, m.city FROM mosques m
     WHERE m.name ILIKE $2 AND m.association_id IS DISTINCT FROM $1
       AND NOT EXISTS (
         SELECT 1 FROM mosque_association_links l
         WHERE l.mosque_id = m.id AND l.association_id = $1 AND l.status = 'pending'
       )
     ORDER BY m.name LIMIT 10`,
    [associationId, needle],
  );
  return result.rows.map((r: Record<string, unknown>) => ({ id: Number(r.id), name: r.name as string, city: (r.city as string) ?? "" }));
}

export type RequestLinkResult =
  | { ok: true; id: number }
  | { ok: false; code: "mosque_not_found" | "already_linked" | "already_pending" };

/** جمعية ترسل «ربط جامع» لجامع قائم: pending حتى يقبله مدير ذلك الجامع */
export async function requestMosqueLink(associationId: number, mosqueId: number): Promise<RequestLinkResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const mosque = await client.query(`SELECT association_id FROM mosques WHERE id = $1 FOR UPDATE`, [mosqueId]);
    if (mosque.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, code: "mosque_not_found" };
    }
    if (mosque.rows[0].association_id !== null && Number(mosque.rows[0].association_id) === associationId) {
      await client.query("ROLLBACK");
      return { ok: false, code: "already_linked" };
    }
    const existing = await client.query(
      `SELECT id, status FROM mosque_association_links WHERE mosque_id = $1 AND association_id = $2 FOR UPDATE`,
      [mosqueId, associationId],
    );
    let id: number;
    if (existing.rows[0]) {
      if (existing.rows[0].status === "pending") {
        await client.query("ROLLBACK");
        return { ok: false, code: "already_pending" };
      }
      // سبق قبوله/اعتذاره: يُعاد فتحه من الجمعية
      await client.query(
        `UPDATE mosque_association_links
         SET status = 'pending', requested_by = 'association', created_at = now(), decided_at = NULL WHERE id = $1`,
        [existing.rows[0].id],
      );
      id = Number(existing.rows[0].id);
    } else {
      const inserted = await client.query(
        `INSERT INTO mosque_association_links (mosque_id, association_id, requested_by)
         VALUES ($1, $2, 'association') RETURNING id`,
        [mosqueId, associationId],
      );
      id = Number(inserted.rows[0].id);
    }
    await client.query(
      `INSERT INTO dev_audit_log (action, target_kind, target_id, details) VALUES ('mosque_link.request', 'mosque_link', $1, $2::jsonb)`,
      [String(id), JSON.stringify({ mosqueId, associationId, requestedBy: "association" })],
    );
    await client.query("COMMIT");
    return { ok: true, id };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export type DecideLinkResult =
  | { ok: true; status: "approved" | "declined" }
  | { ok: false; code: "not_found" | "forbidden" | "already_decided" };

/**
 * البتّ في طلب ربط. الفاعل مشتق من الجلسة؛ authorizeLinkDecision تحصر القرار
 * بالطرف المقابل للمُرسِل. القبول يربط الجامع فعلياً (mosques.association_id).
 * not_found وforbidden يختلفان في الكود فقط؛ المسارات تعيد 404 للاثنين كي لا
 * تكشف وجود طلبات لا تخص المستخدم.
 */
export async function decideLink(linkId: number, actor: LinkActor, accept: boolean): Promise<DecideLinkResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(
      `SELECT id, mosque_id, association_id, requested_by, status
       FROM mosque_association_links WHERE id = $1 FOR UPDATE`,
      [linkId],
    );
    const row = found.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { ok: false, code: "not_found" };
    }
    const link: LinkRecord = {
      id: Number(row.id),
      mosqueId: Number(row.mosque_id),
      associationId: Number(row.association_id),
      requestedBy: row.requested_by as LinkRequestedBy,
      status: row.status as LinkStatus,
    };
    const authz = authorizeLinkDecision(link, actor);
    if (!authz.ok) {
      await client.query("ROLLBACK");
      return { ok: false, code: authz.code };
    }
    const status = accept ? "approved" : "declined";
    await client.query(`UPDATE mosque_association_links SET status = $2, decided_at = now() WHERE id = $1`, [linkId, status]);
    if (accept) {
      await client.query(`UPDATE mosques SET association_id = $2 WHERE id = $1`, [link.mosqueId, link.associationId]);
    }
    await client.query(
      `INSERT INTO dev_audit_log (action, target_kind, target_id, details) VALUES ($1, 'mosque_link', $2, $3::jsonb)`,
      [
        `mosque_link.${status}`,
        String(linkId),
        JSON.stringify({ mosqueId: link.mosqueId, associationId: link.associationId, decidedBy: actor.kind }),
      ],
    );
    await client.query("COMMIT");
    return { ok: true, status };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
