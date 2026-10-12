import "server-only";

import { db } from "./db";
import type { CaseFields, CaseStatus } from "./case-study";

/*
  STEP 65 — الوصول لجدولَي case_studies و case_actions. ملف مستقل حتى لا يتضخّم
  lib/db.ts. halaqahId يطابق students.teacher_id؛ لا استعلام هنا يقبل معرّف
  حلقة من العميل — المسارات تمرّره من الجلسة فقط، وكل استعلام يقيّد بها.
*/

export type CaseSummary = {
  id: number;
  studentId: string;
  studentName: string;
  status: CaseStatus;
  openedAt: string;
  closedAt: string | null;
  lastActionDate: string | null;
};

export type CaseAction = {
  id: number;
  actionDate: string;
  action: string;
  result: string | null;
  createdAt: string;
};

export type CaseDetail = CaseFields & {
  id: number;
  studentId: string;
  studentName: string;
  status: CaseStatus;
  openedAt: string;
  closedAt: string | null;
};

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));

/** هل الخطأ انتهاك فريد (فهرس الحالة المفتوحة الواحدة)؟ */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}

/** كل حالات الحلقة (المفتوحة أولاً ثم الأحدث) مع تاريخ آخر إجراء */
export async function listCases(halaqahId: number): Promise<CaseSummary[]> {
  const rows = await db().sql`
    SELECT c.id, c.student_id, s.name AS student_name, c.status, c.opened_at, c.closed_at,
           (SELECT MAX(a.action_date) FROM case_actions a WHERE a.case_id = c.id) AS last_action_date
    FROM case_studies c
    JOIN students s ON s.teacher_id = c.halaqah_id AND s.id = c.student_id
    WHERE c.halaqah_id = ${halaqahId}
    ORDER BY (c.status = 'open') DESC, c.opened_at DESC, c.id DESC
  `;
  return rows.map((r) => ({
    id: r.id as number,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    status: r.status as CaseStatus,
    openedAt: iso(r.opened_at),
    closedAt: isoOrNull(r.closed_at),
    lastActionDate: (r.last_action_date as string | null) ?? null,
  }));
}

export type OpenCaseResult =
  | { kind: "created"; id: number }
  | { kind: "exists"; id: number }
  | { kind: "not_found" };

/**
 * يفتح حالة لطالب. شرط الطالب (نفس الحلقة، فعّال، غير محذوف) داخل الاستعلام نفسه؛
 * الفهرس الفريد الجزئي يضمن حالة مفتوحة واحدة حتى مع طلبين متزامنين.
 */
export async function openCase(halaqahId: number, studentId: string, openedBy: number): Promise<OpenCaseResult> {
  const rows = await db().sql`
    INSERT INTO case_studies (halaqah_id, student_id, status, opened_by)
    SELECT s.teacher_id, s.id, 'open', ${openedBy}::int
    FROM students s
    WHERE s.teacher_id = ${halaqahId} AND s.id = ${studentId} AND s.active AND s.deleted_at IS NULL
    ON CONFLICT (halaqah_id, student_id) WHERE status = 'open' DO NOTHING
    RETURNING id
  `;
  if (rows[0]) return { kind: "created", id: rows[0].id as number };
  const existing = await db().sql`
    SELECT id FROM case_studies WHERE halaqah_id = ${halaqahId} AND student_id = ${studentId} AND status = 'open'
  `;
  if (existing[0]) return { kind: "exists", id: existing[0].id as number };
  return { kind: "not_found" };
}

/** حالة واحدة من حلقة الجلسة فقط، أو null (حالة حلقة أخرى = غير موجودة) */
export async function getCase(halaqahId: number, caseId: number): Promise<CaseDetail | null> {
  const rows = await db().sql`
    SELECT c.id, c.student_id, s.name AS student_name, c.status, c.opened_at, c.closed_at,
           c.diagnosis, c.strengths, c.weaknesses, c.plan
    FROM case_studies c
    JOIN students s ON s.teacher_id = c.halaqah_id AND s.id = c.student_id
    WHERE c.id = ${caseId} AND c.halaqah_id = ${halaqahId}
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as number,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    status: r.status as CaseStatus,
    openedAt: iso(r.opened_at),
    closedAt: isoOrNull(r.closed_at),
    diagnosis: r.diagnosis as string,
    strengths: r.strengths as string,
    weaknesses: r.weaknesses as string,
    plan: r.plan as string,
  };
}

/** يحدّث الحقول المُرسَلة فقط (غير المُرسَلة تبقى). يرجع false لو الحالة ليست من هذه الحلقة */
export async function updateCaseFields(
  halaqahId: number,
  caseId: number,
  f: Partial<CaseFields>,
): Promise<boolean> {
  const rows = await db().sql`
    UPDATE case_studies SET
      diagnosis  = CASE WHEN ${f.diagnosis !== undefined}::boolean THEN ${f.diagnosis ?? ""}::text ELSE diagnosis END,
      strengths  = CASE WHEN ${f.strengths !== undefined}::boolean THEN ${f.strengths ?? ""}::text ELSE strengths END,
      weaknesses = CASE WHEN ${f.weaknesses !== undefined}::boolean THEN ${f.weaknesses ?? ""}::text ELSE weaknesses END,
      plan       = CASE WHEN ${f.plan !== undefined}::boolean THEN ${f.plan ?? ""}::text ELSE plan END,
      updated_at = now()
    WHERE id = ${caseId} AND halaqah_id = ${halaqahId}
    RETURNING id
  `;
  return rows.length > 0;
}

export type SetStatusResult = { kind: "ok" } | { kind: "not_found" } | { kind: "conflict"; openCaseId: number | null };

/**
 * إغلاق/إعادة فتح. إعادة الفتح تفشل (conflict) لو للطالب حالة مفتوحة أخرى —
 * الفحص بالاستعلام والفهرس الفريد الجزئي خط الدفاع الأخير عند التزامن.
 */
export async function setCaseStatus(halaqahId: number, caseId: number, status: CaseStatus): Promise<SetStatusResult> {
  try {
    if (status === "closed") {
      const rows = await db().sql`
        UPDATE case_studies SET status = 'closed', closed_at = COALESCE(closed_at, now()), updated_at = now()
        WHERE id = ${caseId} AND halaqah_id = ${halaqahId}
        RETURNING id
      `;
      return rows.length > 0 ? { kind: "ok" } : { kind: "not_found" };
    }
    const rows = await db().sql`
      UPDATE case_studies c SET status = 'open', closed_at = NULL, updated_at = now()
      WHERE c.id = ${caseId} AND c.halaqah_id = ${halaqahId}
        AND NOT EXISTS (
          SELECT 1 FROM case_studies o
          WHERE o.halaqah_id = c.halaqah_id AND o.student_id = c.student_id AND o.status = 'open' AND o.id <> c.id
        )
      RETURNING c.id
    `;
    if (rows.length > 0) return { kind: "ok" };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  const current = await db().sql`
    SELECT c.id, (SELECT o.id FROM case_studies o
                  WHERE o.halaqah_id = c.halaqah_id AND o.student_id = c.student_id AND o.status = 'open' AND o.id <> c.id) AS open_id
    FROM case_studies c WHERE c.id = ${caseId} AND c.halaqah_id = ${halaqahId}
  `;
  if (!current[0]) return { kind: "not_found" };
  return { kind: "conflict", openCaseId: (current[0].open_id as number | null) ?? null };
}

export async function listCaseActions(halaqahId: number, caseId: number): Promise<CaseAction[]> {
  const rows = await db().sql`
    SELECT a.id, a.action_date, a.action, a.result, a.created_at
    FROM case_actions a
    JOIN case_studies c ON c.id = a.case_id
    WHERE a.case_id = ${caseId} AND c.halaqah_id = ${halaqahId}
    ORDER BY a.action_date DESC, a.id DESC
  `;
  return rows.map((r) => ({
    id: r.id as number,
    actionDate: r.action_date as string,
    action: r.action as string,
    result: (r.result as string | null) ?? null,
    createdAt: iso(r.created_at),
  }));
}

/** يضيف إجراءً لحالة من حلقة الجلسة فقط؛ حالة حلقة أخرى ترجع null بلا أي كتابة */
export async function addCaseAction(
  halaqahId: number,
  caseId: number,
  createdBy: number,
  actionDate: string,
  action: string,
  result: string | null,
): Promise<CaseAction | null> {
  const rows = await db().sql`
    INSERT INTO case_actions (case_id, action_date, action, result, created_by)
    SELECT c.id, ${actionDate}::text, ${action}::text, ${result}::text, ${createdBy}::int
    FROM case_studies c
    WHERE c.id = ${caseId} AND c.halaqah_id = ${halaqahId}
    RETURNING id, action_date, action, result, created_at
  `;
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id as number,
    actionDate: r.action_date as string,
    action: r.action as string,
    result: (r.result as string | null) ?? null,
    createdAt: iso(r.created_at),
  };
}

export type RecentWard = {
  date: string;
  hifzFrom: number | null;
  hifzTo: number | null;
  reviewFrom: number | null;
  reviewTo: number | null;
  status: string;
};

/** آخر ٥ أوراد لطالب (سياق صفحة الحالة) */
export async function getRecentWards(halaqahId: number, studentId: string, limit = 5): Promise<RecentWard[]> {
  const rows = await db().sql`
    SELECT date, hifz_from, hifz_to, review_from, review_to, status
    FROM ward_logs
    WHERE teacher_id = ${halaqahId} AND student_id = ${studentId}
    ORDER BY date DESC, id DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    date: r.date as string,
    hifzFrom: (r.hifz_from as number | null) ?? null,
    hifzTo: (r.hifz_to as number | null) ?? null,
    reviewFrom: (r.review_from as number | null) ?? null,
    reviewTo: (r.review_to as number | null) ?? null,
    status: r.status as string,
  }));
}

/** تاريخ آخر ورد لكل طالب في الحلقة (للترشيح) */
export async function getLastWardDates(halaqahId: number): Promise<Record<string, string>> {
  const rows = await db().sql`
    SELECT student_id, MAX(date) AS last_date FROM ward_logs
    WHERE teacher_id = ${halaqahId} GROUP BY student_id
  `;
  const out: Record<string, string> = {};
  for (const r of rows) out[r.student_id as string] = r.last_date as string;
  return out;
}
