import "server-only";

import { db } from "./db";
import { isFeatureEnabled, getMosque } from "./mosque/db";
import { hijriMonthRange, monthLabel } from "./hijri";
import { getMonthActuals, listHalaqahPlans } from "./plan-db";
import { summarizePlan, EMPTY_ACTUAL } from "./monthly-plan";
import { riyadhTodayISO } from "./riyadh-date";
import {
  DEFAULT_DISCIPLINE_CONFIG,
  absenceLadderActions,
  absenceStats,
  mergeDisciplineConfig,
  summarizeMonthAttendance,
  violationStepForCount,
  type DisciplineConfig,
  type DisciplineEventKind,
} from "./discipline";

/*
  A2 — الوصول لجداول الانضباط (discipline_events وstudent_suspensions
  وdiscipline_sheets وmosque_settings). ملف مستقل حتى لا يتضخّم lib/db.ts.
  halaqahId يطابق students.teacher_id (الحلقة) — لا استعلام هنا يقبل معرّف
  حلقة من العميل؛ مسارات المعلّم تمرّره من الجلسة فقط، ومسارات الإدارة
  تحصره بجامعها.
*/

// ————— الإعدادات (mosque_settings) —————

/** جامع الحلقة — null إن لم تربط بعد بنظام الجوامع (الميزة تتطلب الربط) */
export async function getMosqueIdForHalaqah(halaqahId: number): Promise<number | null> {
  const rows = await db().sql`SELECT mosque_id FROM halaqahs WHERE id = ${halaqahId}`;
  const mosqueId = rows[0]?.mosque_id;
  return typeof mosqueId === "number" ? mosqueId : null;
}

export async function getDisciplineConfig(mosqueId: number): Promise<DisciplineConfig> {
  try {
    const rows = await db().sql`
      SELECT value FROM mosque_settings WHERE mosque_id = ${mosqueId} AND key = 'discipline'
    `;
    const raw = rows[0]?.value as unknown;
    if (raw === undefined) return DEFAULT_DISCIPLINE_CONFIG;
    return mergeDisciplineConfig(raw);
  } catch {
    // إعدادات مفقودة/تالفة ≠ تعطيل الميزة — الافتراضيات تسري دائماً
    return DEFAULT_DISCIPLINE_CONFIG;
  }
}

export async function setDisciplineConfig(mosqueId: number, config: DisciplineConfig): Promise<void> {
  await db().sql`
    INSERT INTO mosque_settings (mosque_id, key, value, updated_at)
    VALUES (${mosqueId}, 'discipline', ${JSON.stringify(config)}::jsonb, now())
    ON CONFLICT (mosque_id, key) DO UPDATE SET value = excluded.value, updated_at = now()
  `;
}

// ————— بوابة مسارات المعلّم —————

export type DisciplineContext = {
  mosqueId: number;
  config: DisciplineConfig;
  mosqueName: string;
};

/**
 * سياق الانضباط لحلقة (بوابة مسارات المعلّم والولي): الجامع مربوط، والميزة
 * مفعّلة له، والإعدادات محمّلة. null = 404 (غير مربوط أو معطّل).
 */
export async function disciplineContextForHalaqah(halaqahId: number): Promise<DisciplineContext | null> {
  const mosqueId = await getMosqueIdForHalaqah(halaqahId);
  if (mosqueId === null) return null;
  if (!(await isFeatureEnabled(mosqueId, "discipline"))) return null;
  const [config, mosque] = await Promise.all([getDisciplineConfig(mosqueId), getMosque(mosqueId)]);
  if (!mosque) return null;
  return { mosqueId, config, mosqueName: mosque.name };
}

/** طلاب حلقة غير المحذوفين (الفعّال والموقوف معاً — الموقوف يظل بالسجل) */
export async function listHalaqahStudentsBasic(halaqahId: number): Promise<{ id: string; name: string; active: boolean }[]> {
  const rows = await db().sql`
    SELECT id, name, active FROM students
    WHERE teacher_id = ${halaqahId} AND deleted_at IS NULL
    ORDER BY sort_order, name
  `;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string, active: r.active === true }));
}

// ————— قراءة الأحداث —————

export type DisciplineEventRow = {
  id: number;
  halaqahId: number;
  halaqahName: string | null;
  studentId: string;
  studentName: string;
  kind: DisciplineEventKind;
  level: number;
  reason: string;
  origin: "auto" | "manual";
  acknowledgedAt: string | null;
  createdAt: string;
};

function rowToEvent(r: Record<string, unknown>): DisciplineEventRow {
  return {
    id: Number(r.id),
    halaqahId: Number(r.halaqah_id),
    halaqahName: (r.halaqah_name as string | null) ?? null,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    kind: r.kind as DisciplineEventKind,
    level: Number(r.level),
    reason: (r.reason as string) ?? "",
    origin: r.origin as "auto" | "manual",
    acknowledgedAt: r.acknowledged_at ? new Date(r.acknowledged_at as string).toISOString() : null,
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

/** أحداث حلقة واحدة (أو طالب واحد داخلها) — للأحداث الأحدث أولاً */
export async function listHalaqahEvents(
  halaqahId: number,
  studentId?: string,
  limit = 100,
): Promise<DisciplineEventRow[]> {
  const only = studentId ?? null;
  const rows = await db().sql`
    SELECT e.id, e.halaqah_id, e.student_id, e.kind, e.level, e.reason, e.origin,
           e.acknowledged_at, e.created_at, s.name AS student_name, NULL::text AS halaqah_name
    FROM discipline_events e
    JOIN students s ON s.teacher_id = e.halaqah_id AND s.id = e.student_id
    WHERE e.halaqah_id = ${halaqahId} AND (${only}::text IS NULL OR e.student_id = ${only})
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ${limit}::int
  `;
  return rows.map(rowToEvent);
}

/** أحداث طالب واحد كما يراها ولي أمره — لا شيء غير النوع والدرجة والسبب والتاريخ */
export async function listStudentEventsForParent(
  halaqahId: number,
  studentId: string,
  limit = 30,
): Promise<DisciplineEventRow[]> {
  const events = await listHalaqahEvents(halaqahId, studentId, limit);
  // التنبيه الإداري داخلي لا يعني ولي الأمر
  return events.filter((e) => e.kind !== "admin_alert");
}

/** كل أحداث جامع (لإدارته) مع اسم الحلقة */
export async function listMosqueEvents(mosqueId: number, limit = 200): Promise<DisciplineEventRow[]> {
  const rows = await db().sql`
    SELECT e.id, e.halaqah_id, e.student_id, e.kind, e.level, e.reason, e.origin,
           e.acknowledged_at, e.created_at, s.name AS student_name, h.name AS halaqah_name
    FROM discipline_events e
    JOIN students s ON s.teacher_id = e.halaqah_id AND s.id = e.student_id
    JOIN halaqahs h ON h.id = e.halaqah_id
    WHERE h.mosque_id = ${mosqueId}
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ${limit}::int
  `;
  return rows.map(rowToEvent);
}

/** إقرار استلام حدث — محصور بحلقة المعلّم. يرجع true لو أُقرّ فعلاً */
export async function acknowledgeHalaqahEvent(halaqahId: number, eventId: number): Promise<boolean> {
  const rows = await db().sql`
    UPDATE discipline_events SET acknowledged_at = now()
    WHERE id = ${eventId} AND halaqah_id = ${halaqahId} AND acknowledged_at IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

/** إقرار استلام حدث — محصور بجامع مدير الجامع */
export async function acknowledgeMosqueEvent(mosqueId: number, eventId: number): Promise<boolean> {
  const rows = await db().sql`
    UPDATE discipline_events e SET acknowledged_at = now()
    FROM halaqahs h
    WHERE e.id = ${eventId} AND e.halaqah_id = h.id AND h.mosque_id = ${mosqueId}
      AND e.acknowledged_at IS NULL
    RETURNING e.id
  `;
  return rows.length > 0;
}

// ————— سُلّم الغياب (الآلي) —————

export type InsertedLadderEvent = {
  studentId: string;
  kind: "absence_warning" | "parent_summons" | "admin_alert";
  level: number;
  reasonAr: string;
  notifyParent: boolean;
};

/**
 * يدرج حدث غياب آلي — ذرّي ومتكرر الآمن: الفهرس الفريد الجزئي
 * uq_discipline_auto_absence + ON CONFLICT DO NOTHING (بلا هدف — يشمل
 * الفهارس الجزئية التي لا يمكن استنتاجها بمعامل مرتبط) يجعلان إعادة
 * الحساب عند كل حفظ حضور وفتح صفحة بلا أي تكرار. يرجع true لو أُدرج الآن.
 */
async function insertAutoAbsenceEvent(input: {
  halaqahId: number;
  studentId: string;
  kind: "absence_warning" | "parent_summons" | "admin_alert";
  level: number;
  reason: string;
}): Promise<boolean> {
  const rows = await db().sql`
    INSERT INTO discipline_events (halaqah_id, student_id, kind, level, reason, origin, created_by)
    SELECT s.teacher_id, s.id, ${input.kind}::text, ${input.level}::int, ${input.reason}::text, 'auto', NULL
    FROM students s
    WHERE s.teacher_id = ${input.halaqahId} AND s.id = ${input.studentId} AND s.deleted_at IS NULL
    ON CONFLICT DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * حساب سُلّم الغياب لحلقة كاملة من قرارات الحضور المخزَّنة. تُقرأ نافذة
 * الفصل مرة واحدة (لا حضور ضمني — السُلّم على الغياب المعلَّم فقط)، ثم
 * تُدرج الأحداث المستحقّة إدراجاً متكرر الآمن. يرجع الأحداث المُدرجة فعلاً
 * فقط — هي التي تستحق إشعاراً.
 */
export async function runAbsenceLadder(
  halaqahId: number,
  today: string,
  config: DisciplineConfig,
): Promise<InsertedLadderEvent[]> {
  const since = new Date(Date.parse(today) - (config.absence.termDays - 1) * 86400000).toISOString().slice(0, 10);
  const rows = await db().sql`
    SELECT a.student_id, a.date, a.status
    FROM attendance a
    JOIN students s ON s.teacher_id = a.halaqah_id AND s.id = a.student_id
    WHERE a.halaqah_id = ${halaqahId} AND a.date >= ${since} AND a.date <= ${today} AND s.deleted_at IS NULL
  `;

  const byStudent = new Map<string, { date: string; status: "present" | "late" | "excused" | "absent" }[]>();
  for (const r of rows) {
    const list = byStudent.get(r.student_id as string) ?? [];
    list.push({ date: r.date as string, status: r.status as "present" | "late" | "excused" | "absent" });
    byStudent.set(r.student_id as string, list);
  }

  const inserted: InsertedLadderEvent[] = [];
  for (const [studentId, days] of byStudent) {
    const stats = absenceStats(days, today, config.absence);
    for (const action of absenceLadderActions(stats, config.absence)) {
      if (
        await insertAutoAbsenceEvent({
          halaqahId,
          studentId,
          kind: action.kind,
          level: action.level,
          reason: action.reasonAr,
        })
      ) {
        inserted.push({
          studentId,
          kind: action.kind,
          level: action.level,
          reasonAr: action.reasonAr,
          notifyParent: action.notifyParent,
        });
      }
    }
  }
  return inserted;
}

// ————— سُلّم المخالفات —————

export type RecordedViolation = {
  found: boolean;
  step: number;
  eventId: number | null;
  /** تاريخ نهاية الإيقاف ISO إن كانت الدرجة إيقافاً ونُفِّذ */
  suspensionUntil: string | null;
};

/**
 * يسجّل مخالفة طالب داخل حلقة المعلّم ويقترح درجة السُلّم التالية بعدّ
 * مخالفاته السابقة. الدرجة ٥ تنفّذ الإيقاف المؤقت فوراً (N أيام من
 * الإعدادات) والدرجة ٦ رفعاً للجنة. الفصل النهائي ليس هنا — مسار الإدارة فقط.
 */
export async function recordViolation(input: {
  halaqahId: number;
  studentId: string;
  category: string;
  note: string | null;
  createdBy: number;
  config: DisciplineConfig;
}): Promise<RecordedViolation> {
  const prior = await db().sql`
    SELECT count(*) AS n FROM discipline_events
    WHERE halaqah_id = ${input.halaqahId} AND student_id = ${input.studentId} AND kind = 'violation'
  `;
  const step = violationStepForCount(Number(prior[0]?.n ?? 0) + 1, input.config.violations);
  const reason = input.note ? `${input.category} — ${input.note}` : input.category;

  const rows = await db().sql`
    INSERT INTO discipline_events (halaqah_id, student_id, kind, level, reason, origin, created_by)
    SELECT s.teacher_id, s.id, 'violation', ${step}::int, ${reason}::text, 'manual', ${input.createdBy}::int
    FROM students s
    WHERE s.teacher_id = ${input.halaqahId} AND s.id = ${input.studentId} AND s.deleted_at IS NULL
    RETURNING id
  `;
  if (rows.length === 0) return { found: false, step, eventId: null, suspensionUntil: null };
  const eventId = Number(rows[0].id);

  let suspensionUntil: string | null = null;
  if (step === 5) {
    const until = await applySuspension({
      halaqahId: input.halaqahId,
      studentId: input.studentId,
      eventId,
      days: input.config.violations.suspensionDays,
    });
    suspensionUntil = until;
  }
  return { found: true, step, eventId, suspensionUntil };
}

// ————— الإيقاف المؤقت —————

/**
 * يوقف طالباً مؤقتاً: غير فعّال حتى (now + days) مع حفظ حالته السابقة،
 * وسجل إيقاف سارٍ واحد كحدّ أقصى. يرجع تاريخ النهاية ISO أو null إن لم
 * يوجد الطالب بحلقتها أو كان موقوفاً أصلاً.
 */
export async function applySuspension(input: {
  halaqahId: number;
  studentId: string;
  eventId: number;
  days: number;
}): Promise<string | null> {
  const rows = await db().sql`
    WITH s AS (
      SELECT active FROM students
      WHERE teacher_id = ${input.halaqahId} AND id = ${input.studentId} AND deleted_at IS NULL
    ),
    upd AS (
      UPDATE students SET active = false
      WHERE (teacher_id, id) = (${input.halaqahId}, ${input.studentId}) AND EXISTS (SELECT 1 FROM s)
    ),
    ins AS (
      INSERT INTO student_suspensions (halaqah_id, student_id, event_id, days, until, prev_active)
      SELECT ${input.halaqahId}, ${input.studentId}, ${input.eventId}, ${input.days}::int,
             now() + (${input.days}::int * interval '1 day'), s.active
      FROM s
      ON CONFLICT DO NOTHING
      RETURNING until
    )
    SELECT (SELECT until FROM ins) AS until
  `;
  const until = rows[0]?.until;
  return until ? new Date(until as string).toISOString() : null;
}

export type SuspensionRow = {
  halaqahId: number;
  halaqahName: string | null;
  studentId: string;
  studentName: string;
  days: number;
  until: string;
};

/** الإيقافات السارية (لم تُستعَد بعد) — لحلقة أو لجامع كامل */
export async function listActiveSuspensions(
  scope: { halaqahId?: number; mosqueId?: number },
): Promise<SuspensionRow[]> {
  const halaqahId = scope.halaqahId ?? null;
  const mosqueId = scope.mosqueId ?? null;
  const rows = await db().sql`
    SELECT ss.halaqah_id, ss.student_id, ss.days, ss.until, s.name AS student_name, h.name AS halaqah_name
    FROM student_suspensions ss
    JOIN students s ON s.teacher_id = ss.halaqah_id AND s.id = ss.student_id
    JOIN halaqahs h ON h.id = ss.halaqah_id
    WHERE ss.restored_at IS NULL
      AND (${halaqahId}::int IS NULL OR ss.halaqah_id = ${halaqahId})
      AND (${mosqueId}::int IS NULL OR h.mosque_id = ${mosqueId})
    ORDER BY ss.until DESC
  `;
  return rows.map((r) => ({
    halaqahId: Number(r.halaqah_id),
    halaqahName: (r.halaqah_name as string | null) ?? null,
    studentId: r.student_id as string,
    studentName: r.student_name as string,
    days: Number(r.days),
    until: new Date(r.until as string).toISOString(),
  }));
}

export type SuspensionRestoreResult = { due: number; restored: number };

/**
 * استرجاع الطلاب الذين انتهى إيقافهم — يُستدعى كسولاً عند فتح صفحات
 * الانضباط (لا cron): كل سجل إيقاف منتهٍ يُعلَّم restored_at ويُعاد الطالب
 * لحالته قبل الإيقاف إن كان لا يزال غير فعّال. النطاق حلقة أو جامع.
 */
export async function restoreExpiredSuspensions(
  scope: { halaqahId?: number; mosqueId?: number },
): Promise<SuspensionRestoreResult> {
  const halaqahId = scope.halaqahId ?? null;
  const mosqueId = scope.mosqueId ?? null;
  const rows = await db().sql`
    WITH due AS (
      UPDATE student_suspensions ss SET restored_at = now()
      FROM halaqahs h
      WHERE ss.restored_at IS NULL AND ss.until <= now() AND ss.halaqah_id = h.id
        AND (${halaqahId}::int IS NULL OR ss.halaqah_id = ${halaqahId})
        AND (${mosqueId}::int IS NULL OR h.mosque_id = ${mosqueId})
      RETURNING ss.halaqah_id, ss.student_id, ss.prev_active
    ),
    restored AS (
      UPDATE students s SET active = d.prev_active
      FROM due d
      WHERE s.teacher_id = d.halaqah_id AND s.id = d.student_id
        AND s.deleted_at IS NULL AND NOT s.active
      RETURNING s.id
    )
    SELECT (SELECT count(*) FROM due) AS due, (SELECT count(*) FROM restored) AS restored
  `;
  return { due: Number(rows[0]?.due ?? 0), restored: Number(rows[0]?.restored ?? 0) };
}

/** طلاب حلقة من حلقات الجامع (لنموذج الفصل) — null إن لم تكن الحلقة من هذا الجامع */
export async function listMosqueHalaqahStudents(
  mosqueId: number,
  halaqahId: number,
): Promise<{ id: string; name: string }[] | null> {
  const scope = await db().sql`
    SELECT id FROM halaqahs WHERE id = ${halaqahId} AND mosque_id = ${mosqueId}
  `;
  if (scope.length === 0) return null;
  const rows = await db().sql`
    SELECT id, name FROM students
    WHERE teacher_id = ${halaqahId} AND deleted_at IS NULL
    ORDER BY sort_order, name
  `;
  return rows.map((r) => ({ id: r.id as string, name: r.name as string }));
}

// ————— الفصل النهائي (إدارة الجامع فقط) —————

export type DismissalResult = { found: boolean };

/** فصل نهائي بملاحظة لجنة — يبطل الطالب بلا استرجاع. محصور بحلقات الجامع */
export async function dismissStudent(input: {
  mosqueId: number;
  halaqahId: number;
  studentId: string;
  committeeNote: string;
}): Promise<DismissalResult> {
  const rows = await db().sql`
    WITH h AS (
      SELECT id FROM halaqahs WHERE id = ${input.halaqahId} AND mosque_id = ${input.mosqueId}
    ),
    ins AS (
      INSERT INTO discipline_events (halaqah_id, student_id, kind, level, reason, origin, created_by)
      SELECT ${input.halaqahId}, s.id, 'dismissal', 1, ${input.committeeNote}::text, 'manual', NULL
      FROM students s
      WHERE s.teacher_id = ${input.halaqahId} AND s.id = ${input.studentId} AND s.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM h)
      RETURNING id
    ),
    upd AS (
      UPDATE students SET active = false
      WHERE (teacher_id, id) = (${input.halaqahId}, ${input.studentId}) AND EXISTS (SELECT 1 FROM ins)
    ),
    -- إيقاف ساري لطالب فُصل: يُغلق دون استرجاع كي لا يعيده الاسترجاع التلقائي فعّالاً
    closed AS (
      UPDATE student_suspensions SET restored_at = now()
      WHERE halaqah_id = ${input.halaqahId} AND student_id = ${input.studentId}
        AND restored_at IS NULL AND EXISTS (SELECT 1 FROM ins)
    )
    SELECT (SELECT count(*) FROM ins) AS written
  `;
  return { found: Number(rows[0]?.written ?? 0) > 0 };
}

// ————— كشف المتابعة الشهري —————

export type SheetStatusRow = {
  halaqahId: number;
  month: string;
  status: "draft" | "submitted" | "reviewed";
  notes: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
};

function rowToSheetStatus(r: Record<string, unknown>): SheetStatusRow {
  return {
    halaqahId: Number(r.halaqah_id),
    month: r.month as string,
    status: r.status as SheetStatusRow["status"],
    notes: (r.notes as string | null) ?? null,
    submittedAt: r.submitted_at ? new Date(r.submitted_at as string).toISOString() : null,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at as string).toISOString() : null,
  };
}

/** حالة كشف شهر لحلقة — "draft" إن لم يُسلَّم قط (لا صفّ) */
export async function getSheetStatus(halaqahId: number, month: string): Promise<SheetStatusRow> {
  const rows = await db().sql`
    SELECT halaqah_id, month, status, notes, submitted_at, reviewed_at
    FROM discipline_sheets WHERE halaqah_id = ${halaqahId} AND month = ${month}
  `;
  return rows[0]
    ? rowToSheetStatus(rows[0])
    : { halaqahId, month, status: "draft", notes: null, submittedAt: null, reviewedAt: null };
}

/** تسليم الكشف للإدارة (أو إعادة تسليمه بعد فتحه للمراجعة) — من المعلّم فقط */
export async function submitSheet(input: {
  halaqahId: number;
  month: string;
  notes: string | null;
  teacherId: number;
}): Promise<void> {
  await db().sql`
    INSERT INTO discipline_sheets (halaqah_id, month, status, notes, submitted_by, submitted_at, updated_at)
    VALUES (${input.halaqahId}, ${input.month}, 'submitted', ${input.notes}::text, ${input.teacherId}::int, now(), now())
    ON CONFLICT (halaqah_id, month) DO UPDATE SET
      status = 'submitted',
      notes = excluded.notes,
      submitted_by = excluded.submitted_by,
      submitted_at = now(),
      reviewed_at = NULL,
      updated_at = now()
  `;
}

/** فتح الكشف لتعديله — مسموح فقط وهو مُسلَّم (لا يعكّس المراجَع) */
export async function reopenSheet(halaqahId: number, month: string): Promise<boolean> {
  const rows = await db().sql`
    UPDATE discipline_sheets SET status = 'draft', updated_at = now()
    WHERE halaqah_id = ${halaqahId} AND month = ${month} AND status = 'submitted'
    RETURNING id
  `;
  return rows.length > 0;
}

/** مراجعة/فتح كشف من إدارة الجامع — محصور بحلقات جامعها */
export async function adminSetSheet(
  mosqueId: number,
  halaqahId: number,
  month: string,
  action: "review" | "reopen",
): Promise<boolean> {
  const reviewed = action === "review";
  const rows = await db().sql`
    UPDATE discipline_sheets sh SET
      status = ${reviewed ? "reviewed" : "draft"}::text,
      reviewed_at = CASE WHEN ${reviewed}::boolean THEN now() ELSE NULL END,
      updated_at = now()
    FROM halaqahs h
    WHERE sh.halaqah_id = h.id AND h.mosque_id = ${mosqueId}
      AND sh.halaqah_id = ${halaqahId} AND sh.month = ${month}
    RETURNING sh.id
  `;
  return rows.length > 0;
}

export type MosqueSheetRow = SheetStatusRow & {
  halaqahName: string;
  supervisorName: string | null;
  studentsCount: number;
};

/** كل كشوف حلقات الجامع لشهر — المرافَث منها والمتخلّف */
export async function listMosqueSheets(mosqueId: number, month: string): Promise<MosqueSheetRow[]> {
  const rows = await db().sql`
    SELECT h.id AS halaqah_id, h.name AS halaqah_name, sh.month, sh.status, sh.notes,
           sh.submitted_at, sh.reviewed_at,
           (SELECT t.teacher_name FROM teachers t
             WHERE t.halaqah_id = h.id AND t.role = 'supervisor' ORDER BY t.id LIMIT 1) AS supervisor_name,
           (SELECT count(*) FROM students s
             WHERE s.teacher_id = h.id AND s.deleted_at IS NULL) AS students_count
    FROM halaqahs h
    LEFT JOIN discipline_sheets sh ON sh.halaqah_id = h.id AND sh.month = ${month}
    WHERE h.mosque_id = ${mosqueId}
    ORDER BY h.name
  `;
  return rows.map((r) => ({
    halaqahId: Number(r.halaqah_id),
    month,
    status: ((r.status ?? "draft") as MosqueSheetRow["status"]),
    notes: (r.notes as string | null) ?? null,
    submittedAt: r.submitted_at ? new Date(r.submitted_at as string).toISOString() : null,
    reviewedAt: r.reviewed_at ? new Date(r.reviewed_at as string).toISOString() : null,
    halaqahName: r.halaqah_name as string,
    supervisorName: ((r.supervisor_name as string | null) || "") === "" ? null : (r.supervisor_name as string),
    studentsCount: Number(r.students_count ?? 0),
  }));
}

// ————— حساب كشف المتابعة (لا يُخزَّن أبداً) —————

export type SheetStudentRow = {
  studentId: string;
  name: string;
  active: boolean;
  attendance: { present: number; late: number; excused: number; absent: number; unmarked: number };
  hifzPages: number;
  reviewPages: number;
  plan: { hifzTarget: number; reviewTarget: number; overallPct: number | null; status: string | null } | null;
  /** ناجح/مجتاز من جدول الاختبارات إن وُجد (to_regclass)، وإلا null */
  examsPassed: number | null;
  disciplineEvents: number;
};

export type MonthlySheetData = {
  month: string;
  monthLabel: string;
  start: string;
  end: string;
  status: SheetStatusRow["status"];
  notes: string | null;
  examsAvailable: boolean;
  students: SheetStudentRow[];
};

/** الاختبارات اختيارية: جدول exams إن وُجد لاحقاً (halaqah_id, student_id, date, passed) */
async function examsPassedForMonth(
  halaqahId: number,
  start: string,
  end: string,
): Promise<Record<string, number> | null> {
  try {
    const exists = await db().sql`SELECT to_regclass('exams') IS NOT NULL AS exams_exists`;
    if (!exists[0] || exists[0].exams_exists !== true) return null;
    const rows = await db().sql`
      SELECT student_id, count(*) FILTER (WHERE passed) AS passed
      FROM exams
      WHERE halaqah_id = ${halaqahId} AND date >= ${start} AND date <= ${end}
      GROUP BY student_id
    `;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.student_id as string] = Number(r.passed ?? 0);
    return out;
  } catch {
    // شكل الجدول مختلف عن المتوقّع — نتجاهله بدل تعطيل الكشف
    return null;
  }
}

/**
 * كشف المتابعة الشهري لحلقة: كل الأرقام تُحسب لحظة العرض من جداول
 * الحضور والأوراد والخطط والانضباط — لا شيء يُخزَّن من هذه الأرقام.
 */
export async function getMonthlySheetData(
  halaqahId: number,
  month: string,
  config: DisciplineConfig,
): Promise<MonthlySheetData> {
  const range = hijriMonthRange(month);
  const since = range.start;
  const until = range.end;

  const [students, attendanceRows, actuals, plans, eventsRows, exams, sheet] = await Promise.all([
    db().sql`
      SELECT id, name, active FROM students
      WHERE teacher_id = ${halaqahId} AND deleted_at IS NULL
      ORDER BY sort_order, name
    `,
    db().sql`
      SELECT student_id, date, status FROM attendance
      WHERE halaqah_id = ${halaqahId} AND date >= ${since} AND date <= ${until}
    `,
    getMonthActuals(halaqahId, range.start, range.end),
    listHalaqahPlans(halaqahId, month),
    db().sql`
      SELECT student_id, count(*) AS n FROM discipline_events
      WHERE halaqah_id = ${halaqahId}
        AND created_at::date >= ${since}::date AND created_at::date <= ${until}::date
      GROUP BY student_id
    `,
    examsPassedForMonth(halaqahId, range.start, range.end),
    getSheetStatus(halaqahId, month),
  ]);

  const studentIds = students.map((r) => r.id as string);
  const attendance = summarizeMonthAttendance(
    studentIds,
    attendanceRows.map((r) => ({
      studentId: r.student_id as string,
      date: r.date as string,
      status: r.status as "present" | "late" | "excused" | "absent",
    })),
    config.absence.defaultPresent,
  );

  const plansBy = new Map(plans.map((p) => [p.studentId, p.plan]));
  const eventsBy = new Map(eventsRows.map((r) => [r.student_id as string, Number(r.n ?? 0)]));
  const today = riyadhTodayISO();

  const rows: SheetStudentRow[] = students.map((r) => {
    const studentId = r.id as string;
    const plan = plansBy.get(studentId) ?? null;
    const actual = actuals[studentId] ?? EMPTY_ACTUAL;
    const progress = summarizePlan(plan, actual, range, today);
    return {
      studentId,
      name: r.name as string,
      active: r.active === true,
      attendance: attendance[studentId] ?? { present: 0, late: 0, excused: 0, absent: 0, unmarked: 0 },
      hifzPages: actual.hifzPages,
      reviewPages: actual.reviewPages,
      plan: plan
        ? {
            hifzTarget: plan.hifzPagesTarget,
            reviewTarget: plan.reviewPagesTarget,
            overallPct: progress.overallPct,
            status: progress.status,
          }
        : null,
      examsPassed: exams ? (exams[studentId] ?? 0) : null,
      disciplineEvents: eventsBy.get(studentId) ?? 0,
    };
  });

  return {
    month,
    monthLabel: monthLabel(month),
    start: range.start,
    end: range.end,
    status: sheet.status,
    notes: sheet.notes,
    examsAvailable: exams !== null,
    students: rows,
  };
}
