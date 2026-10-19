import "server-only";

import { db } from "./db";
import { getMosqueSetting, setMosqueSetting } from "./mosque-settings-db";
import {
  canEditVisit,
  canTransitionVisit,
  computeOverallScore,
  isVisitAction,
  mergeVisitCriteria,
  VISIT_NOTES_MAX,
  parseVisitScoresBody,
  type VisitCriterion,
  type VisitScores,
  type VisitStatus,
} from "./supervisor-visits";

/*
  B4 — الوصول لزيارات المشرفين (supervisor_visits ودرجات معاييرها). كل دالة
  تقيّد الاستعلام بنطاق المستدعي (جامع، جمعية، حلقة) — لا ثقة بمعرّف من
  العميل أبداً: مدير الجامع يصل بمعرّف جامعه من المسار، ومدير الجمعية
  بمعرّف جمعيته من الجلسة، والمعلّم بحلقته من جلسته.
*/

export async function getVisitCriteria(mosqueId: number): Promise<VisitCriterion[]> {
  return mergeVisitCriteria(await getMosqueSetting(mosqueId, "visit_criteria"));
}

export async function setVisitCriteria(mosqueId: number, criteria: VisitCriterion[]): Promise<void> {
  await setMosqueSetting(mosqueId, "visit_criteria", { criteria });
}

// ————— الصفوف —————

export type VisitRow = {
  id: number;
  associationId: number | null;
  mosqueId: number;
  halaqahId: number;
  halaqahName: string;
  visitorKind: "association_admin" | "mosque_admin";
  visitorName: string;
  scheduledFor: string;
  visitedAt: string | null;
  status: VisitStatus;
  overallScore: number | null;
  notes: string;
  recommendations: string;
  createdAt: string;
};

function rowToVisit(r: Record<string, unknown>): VisitRow {
  return {
    id: Number(r.id),
    associationId: r.association_id === null || r.association_id === undefined ? null : Number(r.association_id),
    mosqueId: Number(r.mosque_id),
    halaqahId: Number(r.halaqah_id),
    halaqahName: (r.halaqah_name as string) ?? "",
    visitorKind: r.visitor_kind === "association_admin" ? "association_admin" : "mosque_admin",
    visitorName: (r.visitor_name as string) ?? "",
    scheduledFor: String(r.scheduled_for).slice(0, 10),
    visitedAt: r.visited_at ? new Date(r.visited_at as string).toISOString() : null,
    status: (["scheduled", "done", "cancelled"] as const).includes(r.status as VisitStatus)
      ? (r.status as VisitStatus)
      : "scheduled",
    overallScore: r.overall_score === null || r.overall_score === undefined ? null : Number(r.overall_score),
    notes: (r.notes as string) ?? "",
    recommendations: (r.recommendations as string) ?? "",
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

export async function listVisitsForMosque(mosqueId: number): Promise<VisitRow[]> {
  const rows = await db().sql`
    SELECT v.id, v.association_id, v.mosque_id, v.halaqah_id, h.name AS halaqah_name,
           v.visitor_kind, v.visitor_name, v.scheduled_for, v.visited_at, v.status,
           v.overall_score, v.notes, v.recommendations, v.created_at
    FROM supervisor_visits v JOIN halaqahs h ON h.id = v.halaqah_id
    WHERE v.mosque_id = ${mosqueId}
    ORDER BY v.scheduled_for DESC, v.id DESC
  `;
  return rows.map(rowToVisit);
}

export async function listVisitsForAssociation(associationId: number): Promise<(VisitRow & { mosqueName: string })[]> {
  const rows = await db().sql`
    SELECT v.id, v.association_id, v.mosque_id, v.halaqah_id, h.name AS halaqah_name,
           v.visitor_kind, v.visitor_name, v.scheduled_for, v.visited_at, v.status,
           v.overall_score, v.notes, v.recommendations, v.created_at, m.name AS mosque_name
    FROM supervisor_visits v
    JOIN halaqahs h ON h.id = v.halaqah_id
    JOIN mosques m ON m.id = v.mosque_id
    LEFT JOIN mosque_features mf ON mf.mosque_id = m.id AND mf.feature_key = 'supervisor_visits'
    WHERE m.association_id = ${associationId} AND v.association_id = ${associationId}
      AND COALESCE(mf.enabled, false) = true
    ORDER BY v.scheduled_for DESC, v.id DESC
  `;
  return rows.map((r) => ({ ...rowToVisit(r), mosqueName: (r.mosque_name as string) ?? "" }));
}

/** المعلّم يرى الزيارات المنجزة لحلقته فقط — ملاحظات وتوصيات ودرجات */
export async function listDoneVisitsForHalaqah(halaqahId: number): Promise<VisitRow[]> {
  const rows = await db().sql`
    SELECT v.id, v.association_id, v.mosque_id, v.halaqah_id, h.name AS halaqah_name,
           v.visitor_kind, v.visitor_name, v.scheduled_for, v.visited_at, v.status,
           v.overall_score, v.notes, v.recommendations, v.created_at
    FROM supervisor_visits v JOIN halaqahs h ON h.id = v.halaqah_id
    WHERE v.halaqah_id = ${halaqahId} AND v.mosque_id = h.mosque_id AND v.status = 'done'
    ORDER BY v.visited_at DESC, v.id DESC
  `;
  return rows.map(rowToVisit);
}

/** زيارة داخل جامع معيّن — null لأي زيارة جامع آخر (لا يُكشف وجودها) */
export async function getVisitForMosque(mosqueId: number, visitId: number): Promise<VisitRow | null> {
  const rows = await db().sql`
    SELECT v.id, v.association_id, v.mosque_id, v.halaqah_id, h.name AS halaqah_name,
           v.visitor_kind, v.visitor_name, v.scheduled_for, v.visited_at, v.status,
           v.overall_score, v.notes, v.recommendations, v.created_at
    FROM supervisor_visits v JOIN halaqahs h ON h.id = v.halaqah_id
    WHERE v.id = ${visitId} AND v.mosque_id = ${mosqueId}
  `;
  return rows[0] ? rowToVisit(rows[0]) : null;
}

/** زيارة لجامع من جمعية معيّنة — انتماء الجامع للجمعية هو الفيصل */
export async function getVisitForAssociation(associationId: number, visitId: number): Promise<VisitRow | null> {
  const rows = await db().sql`
    SELECT v.id, v.association_id, v.mosque_id, v.halaqah_id, h.name AS halaqah_name,
           v.visitor_kind, v.visitor_name, v.scheduled_for, v.visited_at, v.status,
           v.overall_score, v.notes, v.recommendations, v.created_at
    FROM supervisor_visits v
    JOIN halaqahs h ON h.id = v.halaqah_id
    JOIN mosques m ON m.id = v.mosque_id
    WHERE v.id = ${visitId} AND m.association_id = ${associationId}
  `;
  return rows[0] ? rowToVisit(rows[0]) : null;
}

// ————— الحلقات (للجدولة والتحقق) —————

export type VisitHalaqah = { id: number; name: string; mosqueId: number; mosqueName: string; teacherNames: string };

/** جوامع الجمعية مع حالة تفعيل الميزة لكل منها — لمنتقي الجدولة بلوحة الجمعية */
export async function listAssociationVisitTargets(
  associationId: number,
): Promise<{ mosqueId: number; name: string; enabled: boolean }[]> {
  const rows = await db().sql`
    SELECT m.id, m.name, COALESCE(mf.enabled, false) AS enabled
    FROM mosques m
    LEFT JOIN mosque_features mf ON mf.mosque_id = m.id AND mf.feature_key = 'supervisor_visits'
    WHERE m.association_id = ${associationId}
    ORDER BY m.name
  `;
  return rows.map((r) => ({
    mosqueId: Number(r.id),
    name: (r.name as string) ?? "",
    enabled: r.enabled === true,
  }));
}

/** حلقة جامع واحدة — يتحقق بها المسار أن الحلقة المطلوبة من الجامع نفسه */
export async function getHalaqahInMosque(mosqueId: number, halaqahId: number): Promise<VisitHalaqah | null> {
  const rows = await db().sql`
    SELECT h.id, h.name, h.mosque_id, m.name AS mosque_name,
           COALESCE((
             SELECT string_agg(COALESCE(NULLIF(t.teacher_name, ''), t.username), '، ' ORDER BY (t.role = 'supervisor') DESC)
             FROM teachers t WHERE t.halaqah_id = h.id AND t.deactivated_at IS NULL
           ), '') AS teacher_names
    FROM halaqahs h JOIN mosques m ON m.id = h.mosque_id
    WHERE h.id = ${halaqahId} AND h.mosque_id = ${mosqueId}
  `;
  return rows[0]
    ? {
        id: Number(rows[0].id),
        name: (rows[0].name as string) ?? "",
        mosqueId: Number(rows[0].mosque_id),
        mosqueName: (rows[0].mosque_name as string) ?? "",
        teacherNames: (rows[0].teacher_names as string) ?? "",
      }
    : null;
}

// ————— الإنشاء والتعديل —————

export async function createVisit(input: {
  associationId: number | null;
  mosqueId: number;
  halaqahId: number;
  visitorKind: "association_admin" | "mosque_admin";
  visitorId: number | null;
  visitorName: string;
  scheduledFor: string;
}): Promise<VisitRow> {
  const rows = await db().sql`
    INSERT INTO supervisor_visits
      (association_id, mosque_id, halaqah_id, visitor_kind, visitor_id, visitor_name, scheduled_for)
    VALUES
      (${input.associationId}, ${input.mosqueId}, ${input.halaqahId},
       ${input.visitorKind}, ${input.visitorId}, ${input.visitorName}, ${input.scheduledFor}::date)
    RETURNING id, association_id, mosque_id, halaqah_id,
      (SELECT name FROM halaqahs WHERE id = ${input.halaqahId}) AS halaqah_name,
      visitor_kind, visitor_name, scheduled_for, visited_at, status,
      overall_score, notes, recommendations, created_at
  `;
  return rowToVisit(rows[0]);
}

export async function getVisitScores(visitId: number): Promise<VisitScores> {
  const rows = await db().sql`
    SELECT criterion_key, score, note FROM visit_criteria_scores WHERE visit_id = ${visitId}
  `;
  const scores: VisitScores = {};
  for (const row of rows) {
    scores[row.criterion_key as string] = row.note
      ? { score: Number(row.score), note: row.note as string }
      : { score: Number(row.score) };
  }
  return scores;
}

/** يستبدل درجات الزيارة كلها بالجسم الجديد (المفاتيح تحُقّقت قبل الوصول هنا) */
export async function saveVisitScores(visitId: number, scores: VisitScores): Promise<void> {
  // حذف+إدراج بمعاملة واحدة: فشل منتصف الطريق لا يمسح درجات الزيارة المخزّنة
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM visit_criteria_scores WHERE visit_id = $1`, [visitId]);
    for (const [key, value] of Object.entries(scores)) {
      await client.query(
        `INSERT INTO visit_criteria_scores (visit_id, criterion_key, score, note) VALUES ($1, $2, $3, $4)`,
        [visitId, key, value.score, value.note ?? ""],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateVisitRow(
  visitId: number,
  patch: {
    status?: VisitStatus;
    visitedAt?: string | null;
    overallScore?: number | null;
    notes?: string;
    recommendations?: string;
  },
): Promise<void> {
  await db().sql`
    UPDATE supervisor_visits SET
      status = COALESCE(${patch.status ?? null}, status),
      visited_at = CASE WHEN ${patch.visitedAt !== undefined} THEN ${patch.visitedAt}::timestamptz ELSE visited_at END,
      overall_score = CASE WHEN ${patch.overallScore !== undefined} THEN ${patch.overallScore} ELSE overall_score END,
      notes = COALESCE(${patch.notes ?? null}, notes),
      recommendations = COALESCE(${patch.recommendations ?? null}, recommendations)
    WHERE id = ${visitId}
  `;
}

// ————— إجراء واحد على زيارة (مشترك بين مساري الجامع والجمعية) —————

export type ApplyVisitActionInput = {
  visit: VisitRow;
  body: { action?: unknown; scores?: unknown; notes?: unknown; recommendations?: unknown };
};

export type ApplyVisitActionResult =
  | { ok: true; visit: VisitRow; scores: VisitScores }
  | { ok: false; status: 400; error: string };

/**
 * ينفّذ إجراء الخادم الوحيد لتعديل زيارة (بعد أن تحقّق المسار من صلاحية
 * المستدعي على الجامع): save (مسوّدة بلا تغيير حالة)، done (يستلزم تقييم
 * كل المعايير — المدموجة مع المخزّنة سابقاً)، cancel (من المجدولة فقط)،
 * reopen (من المنجزة). الزيارة الملغاة نهائية لا تُعدَّل. الدرجة الكلية
 * تُحسب هنا خادمياً ولا تُقبل من العميل أبداً.
 */
export async function applyVisitAction(input: ApplyVisitActionInput): Promise<ApplyVisitActionResult> {
  const { visit, body } = input;
  const action = body.action === undefined ? "save" : body.action;
  if (!isVisitAction(action)) return { ok: false, status: 400, error: "إجراء غير معروف" };
  if (!canEditVisit(visit.status)) return { ok: false, status: 400, error: "زيارة ملغاة لا تُعدَّل" };

  const criteria = await getVisitCriteria(visit.mosqueId);
  const parsed = parseVisitScoresBody(body.scores, criteria);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const existing = await getVisitScores(visit.id);
  const merged: VisitScores = { ...existing, ...parsed.scores };
  // مسح درجة معيار (score: null) مسموح ما دامت الزيارة مجدولة فقط؛ المنجزة تبقى مكتملة
  if (visit.status === "scheduled") {
    for (const key of parsed.cleared ?? []) delete merged[key];
  }

  let status: VisitStatus = visit.status;
  let visitedAt: string | null | undefined; // undefined = لا تغيير
  let overallScore: number | null | undefined;

  if (action === "cancel") {
    if (!canTransitionVisit(visit.status, "cancelled")) {
      return { ok: false, status: 400, error: "لا يمكن إلغاء زيارة منجزة — أعد فتحها أولاً" };
    }
    status = "cancelled";
  } else if (action === "reopen") {
    if (!canTransitionVisit(visit.status, "scheduled")) {
      return { ok: false, status: 400, error: "إعادة الفتح للزيارات المنجزة فقط" };
    }
    status = "scheduled";
    visitedAt = null;
    overallScore = null;
  } else {
    const total = computeOverallScore(criteria, merged);
    if (action === "done") {
      if (!canTransitionVisit(visit.status, "done")) {
        return { ok: false, status: 400, error: "لا يمكن إنهاء زيارة بهذه الحالة" };
      }
      if (!total.complete) {
        return { ok: false, status: 400, error: "إنهاء الزيارة يتطلب تقييم كل المعايير" };
      }
      status = "done";
      visitedAt = new Date().toISOString();
      overallScore = total.overallScore;
    } else if (visit.status === "done") {
      // تعديل مسوّدة بعد الإنجاز يعيد حساب الدرجة الكلية من الدرجات الجديدة
      overallScore = total.overallScore;
    }
    await saveVisitScores(visit.id, merged);
  }

  await updateVisitRow(visit.id, {
    status,
    visitedAt,
    overallScore,
    notes: body.notes === undefined ? undefined : String(body.notes).trim().slice(0, VISIT_NOTES_MAX),
    recommendations:
      body.recommendations === undefined ? undefined : String(body.recommendations).trim().slice(0, VISIT_NOTES_MAX),
  });

  const updated: VisitRow = {
    ...visit,
    status,
    visitedAt: visitedAt === undefined ? visit.visitedAt : visitedAt,
    overallScore: overallScore === undefined ? visit.overallScore : overallScore,
    notes: body.notes === undefined ? visit.notes : String(body.notes).trim().slice(0, VISIT_NOTES_MAX),
    recommendations:
      body.recommendations === undefined
        ? visit.recommendations
        : String(body.recommendations).trim().slice(0, VISIT_NOTES_MAX),
  };
  return { ok: true, visit: updated, scores: action === "cancel" ? existing : merged };
}

// ————— متوسطات لوحة الجامع —————

export type HalaqahVisitAverage = { halaqahId: number; halaqahName: string; visits: number; avgScore: number | null };

/**
 * متوسط درجات الزيارات المنجزة لكل حلقة خلال آخر ٩٠ يوماً (بتاريخ الإنجاز)
 * — للبطاقة البسيطة بلوحة الجامع. حلقات بلا زيارات منجزة لا تظهر.
 */
export async function halaqahVisitAverages(mosqueId: number, days = 90): Promise<HalaqahVisitAverage[]> {
  const rows = await db().sql`
    SELECT h.id, h.name,
           count(v.id)::int AS visits,
           round(avg(v.overall_score))::int AS avg_score
    FROM supervisor_visits v JOIN halaqahs h ON h.id = v.halaqah_id
    WHERE v.mosque_id = ${mosqueId} AND v.status = 'done'
      AND v.visited_at >= now() - make_interval(days => ${days})
    GROUP BY h.id, h.name
    ORDER BY h.name
  `;
  return rows.map((r) => ({
    halaqahId: Number(r.id),
    halaqahName: (r.name as string) ?? "",
    visits: Number(r.visits ?? 0),
    avgScore: r.avg_score === null || r.avg_score === undefined ? null : Number(r.avg_score),
  }));
}
