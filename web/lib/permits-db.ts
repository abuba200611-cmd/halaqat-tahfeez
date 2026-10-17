import "server-only";

import { db } from "./db";
import { getMosqueSetting, setMosqueSetting } from "./mosque-settings-db";
import { riyadhTodayISO } from "./riyadh-date";
import {
  academicYearEnd,
  academicYearOf,
  academicYearStart,
  applyPermitAction,
  computePermitSuggestions,
  isPermitStatus,
  mergePermitsConfig,
  PERMIT_NOTES_MAX,
  type HalaqahPermitState,
  type PermitAction,
  type PermitRecord,
  type PermitsConfig,
  type PermitStatus,
  type PermitSuggestion,
} from "./permits";

/*
  A3 — الوصول لجداول التصاريح (halaqah_permits وpermits_log). الأرقام
  (الطلاب الفعّالون…) تُحسب لحظة العرض من جداول الحلقات ولا تُخزَّن؛
  المخزَّن الحالة والسجل فقط. كل دالة هنا تقبل mosqueId وتتحقق أن الحلقة
  تتبعه — لا تثق بمعرّف حلقة من العميل.
*/

export async function getPermitsConfig(mosqueId: number): Promise<PermitsConfig> {
  return mergePermitsConfig(await getMosqueSetting(mosqueId, "permits"));
}

export async function setPermitsConfig(mosqueId: number, config: PermitsConfig): Promise<void> {
  await setMosqueSetting(mosqueId, "permits", config);
}

function toISODate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

type PermitRow = PermitRecord & { halaqahId: number; notes: string };

function rowToPermit(r: Record<string, unknown>): PermitRow {
  return {
    halaqahId: Number(r.halaqah_id),
    academicYear: Number(r.academic_year),
    status: isPermitStatus(r.status) ? r.status : "active",
    issuedAt: toISODate(r.issued_at),
    renewalDue: toISODate(r.renewal_due),
    suspensionsCount: Number(r.suspensions_count ?? 0),
    notes: (r.notes as string) ?? "",
  };
}

export type PermitLogEntry = {
  id: number;
  halaqahId: number | null;
  halaqahName: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  actorKind: string;
  details: Record<string, unknown>;
  createdAt: string;
};

export async function listPermitsLog(mosqueId: number, limit = 50): Promise<PermitLogEntry[]> {
  const rows = await db().sql`
    SELECT l.id, l.halaqah_id, h.name AS halaqah_name, l.action, l.from_status, l.to_status,
           l.actor_kind, l.details, l.created_at
    FROM permits_log l
    LEFT JOIN halaqahs h ON h.id = l.halaqah_id
    WHERE l.mosque_id = ${mosqueId}
    ORDER BY l.id DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    halaqahId: r.halaqah_id === null ? null : Number(r.halaqah_id),
    halaqahName: (r.halaqah_name as string | null) ?? null,
    action: r.action as string,
    fromStatus: (r.from_status as string | null) ?? null,
    toStatus: (r.to_status as string | null) ?? null,
    actorKind: r.actor_kind as string,
    details: (r.details as Record<string, unknown>) ?? {},
    createdAt: new Date(r.created_at as string).toISOString(),
  }));
}

export type HalaqahPermitView = HalaqahPermitState & { notes: string };

/** حلقات الجامع مع طلابها الفعّالين وتصريح العام المعطى (وتاريخ تصاريحها السابقة) */
export async function listHalaqahPermitStates(mosqueId: number, year: number): Promise<HalaqahPermitView[]> {
  const [halaqat, permits] = await Promise.all([
    db().sql`
      SELECT h.id, h.name,
             (SELECT count(*) FROM students s
              WHERE s.teacher_id = h.id AND s.active AND s.deleted_at IS NULL)::int AS active_students
      FROM halaqahs h
      WHERE h.mosque_id = ${mosqueId}
      ORDER BY h.name
    `,
    db().sql`
      SELECT p.halaqah_id, p.academic_year, p.status, p.issued_at::text AS issued_at, p.renewal_due::text AS renewal_due, p.suspensions_count, p.notes
      FROM halaqah_permits p
      JOIN halaqahs h ON h.id = p.halaqah_id
      WHERE h.mosque_id = ${mosqueId}
    `,
  ]);
  const byHalaqah = new Map<number, PermitRow[]>();
  for (const row of permits.map(rowToPermit)) {
    const list = byHalaqah.get(row.halaqahId) ?? [];
    list.push(row);
    byHalaqah.set(row.halaqahId, list);
  }
  return halaqat.map((h) => {
    const id = Number(h.id);
    const all = byHalaqah.get(id) ?? [];
    const current = all.find((p) => p.academicYear === year) ?? null;
    return {
      halaqahId: id,
      name: h.name as string,
      activeStudents: Number(h.active_students ?? 0),
      permit: current
        ? {
            academicYear: current.academicYear,
            status: current.status,
            issuedAt: current.issuedAt,
            renewalDue: current.renewalDue,
            suspensionsCount: current.suspensionsCount,
          }
        : null,
      notes: current?.notes ?? "",
      everHadPermit: all.length > 0,
      priorWithdrawn: all.some((p) => p.academicYear < year && p.status === "withdrawn"),
    };
  });
}

async function upgradeRequestedInYear(mosqueId: number, year: number, config: PermitsConfig): Promise<boolean> {
  const from = academicYearStart(year, config);
  const to = academicYearEnd(year, config);
  const rows = await db().sql`
    SELECT 1 FROM permits_log
    WHERE mosque_id = ${mosqueId} AND action = 'upgrade_request'
      AND created_at >= ${from}::date AND created_at < (${to}::date + INTERVAL '1 day')
    LIMIT 1
  `;
  return rows.length > 0;
}

export type PermitsOverview = {
  config: PermitsConfig;
  today: string;
  academicYear: number;
  halaqat: HalaqahPermitView[];
  suggestions: PermitSuggestion[];
  log: PermitLogEntry[];
};

export async function buildPermitsOverview(mosqueId: number, today = riyadhTodayISO()): Promise<PermitsOverview> {
  const config = await getPermitsConfig(mosqueId);
  const academicYear = academicYearOf(today, config);
  const [halaqat, upgradeRequestedThisYear, log] = await Promise.all([
    listHalaqahPermitStates(mosqueId, academicYear),
    upgradeRequestedInYear(mosqueId, academicYear, config),
    listPermitsLog(mosqueId),
  ]);
  const suggestions = computePermitSuggestions({
    today,
    config,
    halaqat,
    mosque: {
      activeStudents: halaqat.reduce((sum, h) => sum + h.activeStudents, 0),
      halaqatCount: halaqat.length,
      upgradeRequestedThisYear,
    },
  });
  return { config, today, academicYear, halaqat, suggestions, log };
}

export type Actor = { kind: "mosque_admin" | "developer"; id: number | null };

export type ApplyResult =
  | { ok: true; permit: PermitRecord; fromStatus: PermitStatus | null }
  | { ok: false; status: 404 | 409; error: string };

/**
 * ينفّذ إجراءً يدوياً على تصريح حلقة في ترانزاكشن واحدة (قفل الصف يمنع تداخل
 * إيقافين متزامنين يعدّان مرة واحدة) ويسجّله في permits_log. الحلقة يجب أن
 * تتبع هذا الجامع وإلا 404.
 */
export async function applyPermitActionDb(input: {
  mosqueId: number;
  halaqahId: number;
  action: PermitAction;
  actor: Actor;
  notes?: string;
  today?: string;
}): Promise<ApplyResult> {
  const today = input.today ?? riyadhTodayISO();
  const config = await getPermitsConfig(input.mosqueId);
  const year = academicYearOf(today, config);

  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const owned = await client.query(`SELECT id FROM halaqahs WHERE id = $1 AND mosque_id = $2`, [
      input.halaqahId,
      input.mosqueId,
    ]);
    if ((owned.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false, status: 404, error: "الحلقة غير موجودة في هذا الجامع" };
    }
    const found = await client.query(
      `SELECT halaqah_id, academic_year, status, issued_at::text AS issued_at, renewal_due::text AS renewal_due,
              suspensions_count, notes
       FROM halaqah_permits WHERE halaqah_id = $1 AND academic_year = $2 FOR UPDATE`,
      [input.halaqahId, year],
    );
    const current = found.rows[0] ? rowToPermit(found.rows[0]) : null;
    const transition = applyPermitAction(current, input.action, { today, year, config });
    if (!transition.ok) {
      await client.query("ROLLBACK");
      return { ok: false, status: 409, error: transition.error };
    }
    const next = transition.next;
    const notes = (input.notes ?? current?.notes ?? "").trim().slice(0, PERMIT_NOTES_MAX);
    await client.query(
      `INSERT INTO halaqah_permits
         (halaqah_id, academic_year, status, issued_at, renewal_due, suspensions_count, notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (halaqah_id, academic_year) DO UPDATE SET
         status = excluded.status, issued_at = excluded.issued_at, renewal_due = excluded.renewal_due,
         suspensions_count = excluded.suspensions_count, notes = excluded.notes, updated_at = now()`,
      [input.halaqahId, year, next.status, next.issuedAt, next.renewalDue, next.suspensionsCount, notes],
    );
    await client.query(
      `INSERT INTO permits_log (mosque_id, halaqah_id, action, from_status, to_status, actor_kind, actor_id, details)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
      [
        input.mosqueId,
        input.halaqahId,
        input.action,
        current?.status ?? null,
        next.status,
        input.actor.kind,
        input.actor.id,
        JSON.stringify({ academicYear: year, notes: notes === "" ? undefined : notes }),
      ],
    );
    await client.query("COMMIT");
    return { ok: true, permit: next, fromStatus: current?.status ?? null };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** يسجّل طلب ترقية الحلقات إلى «مجمع» (على مستوى الجامع) — يخفي بطاقة الاقتراح باقي العام */
export async function recordUpgradeRequest(mosqueId: number, actor: Actor, notes: string): Promise<void> {
  await db().sql`
    INSERT INTO permits_log (mosque_id, halaqah_id, action, from_status, to_status, actor_kind, actor_id, details)
    VALUES (${mosqueId}, NULL, 'upgrade_request', NULL, NULL, ${actor.kind}, ${actor.id},
            ${JSON.stringify({ notes: notes.trim().slice(0, PERMIT_NOTES_MAX) })}::jsonb)
  `;
}
