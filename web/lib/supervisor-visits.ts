/*
  B4 — زيارات المشرف التربوي: منطق نقي (بلا قاعدة بيانات ولا cookies)
  يشاركه الخادم والواجهة والاختبارات. المعايير الافتراضية هنا، وقابلة للضبط
  لكل جامع من مفتاح "visit_criteria" في mosque_settings. الدرجة الكلية
  (٠..١٠٠) تُحسب بالكود من درجات المعايير (كل معيار ٠..٥) ولا تُقبل من العميل.
*/

export const SUPERVISOR_VISITS_FEATURE_KEY = "supervisor_visits";
export const VISIT_NOTES_MAX = 2000;
export const VISIT_CRITERIA_NOTE_MAX = 300;
export const VISIT_CRITERIA_MAX = 12;
export const CRITERION_SCORE_MAX = 5;

export type VisitCriterion = { key: string; label: string };

export const DEFAULT_VISIT_CRITERIA: VisitCriterion[] = [
  { key: "attendance_discipline", label: "انضباط الحضور" },
  { key: "recitation_quality", label: "جودة التسميع" },
  { key: "tajweed_application", label: "تطبيق أحكام التجويد" },
  { key: "plan_commitment", label: "الالتزام بالخطة" },
  { key: "environment_order", label: "البيئة والتنظيم" },
  { key: "student_engagement", label: "تفاعل الطلاب" },
  { key: "teacher_records", label: "سجلات المعلم" },
];

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function normalizeCriteria(value: unknown): VisitCriterion[] | null {
  if (!Array.isArray(value)) return null;
  const seen = new Set<string>();
  const out: VisitCriterion[] = [];
  for (const item of value) {
    const row = asObject(item);
    const label = typeof row.label === "string" ? row.label.trim().slice(0, 60) : "";
    const key = typeof row.key === "string" ? row.key.trim().slice(0, 40) : "";
    if (label === "" || key === "" || seen.has(key) || !/^[A-Za-z0-9_-]+$/.test(key)) return null;
    seen.add(key);
    out.push({ key, label });
  }
  return out.length > 0 && out.length <= VISIT_CRITERIA_MAX ? out : null;
}

/** يدمج المخزون (قائمة معايير جزئية أو تالفة) فوق الافتراضي مع تقييد كل قيمة */
export function mergeVisitCriteria(stored: unknown): VisitCriterion[] {
  const source = asObject(stored);
  return normalizeCriteria(source.criteria) ?? DEFAULT_VISIT_CRITERIA.map((c) => ({ ...c }));
}

export type ParsedVisitCriteriaBody = { ok: true; criteria: VisitCriterion[] } | { ok: false; error: string };

/** يتحقّق من جسم PUT لإعدادات المعايير: أي قيمة معطوبة = رفض صريح */
export function parseVisitCriteriaBody(body: unknown): ParsedVisitCriteriaBody {
  const raw = asObject(body);
  if (raw.criteria === undefined) return { ok: false, error: "قائمة المعايير مطلوبة" };
  const criteria = normalizeCriteria(raw.criteria);
  if (criteria === null) {
    return {
      ok: false,
      error: `المعايير: من ١ إلى ${VISIT_CRITERIA_MAX} معياراً، لكلٍّ اسم ومفتاح فريد (حروف لاتينية/أرقام)`,
    };
  }
  return { ok: true, criteria };
}

// ————— الحالات والانتقالات —————

export type VisitStatus = "scheduled" | "done" | "cancelled";

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  scheduled: "مجدولة",
  done: "منجزة",
  cancelled: "ملغاة",
};

/** زيارة ملغاة نهائية: لا تعديل عليها إطلاقاً (درجات أو حالة) */
export function canEditVisit(status: VisitStatus): boolean {
  return status !== "cancelled";
}

/**
 * الانتقالات المسموحة: مجدولة → منجزة/ملغاة، ومنجزة → مجدولة (إعادة فتح
 * لتصحيح التقييم) أو إعادة إنهاء بعد تعديل. الملغاة لا تُغادر أبداً.
 */
export function canTransitionVisit(from: VisitStatus, to: VisitStatus): boolean {
  if (from === "cancelled") return false;
  if (from === "scheduled") return to === "done" || to === "cancelled";
  return to === "scheduled" || to === "done"; // from === "done"
}

export function isVisitStatus(value: unknown): value is VisitStatus {
  return value === "scheduled" || value === "done" || value === "cancelled";
}

export function isVisitorKind(value: unknown): value is "association_admin" | "mosque_admin" {
  return value === "association_admin" || value === "mosque_admin";
}

// ————— تواريخ —————

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isRealISODate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === value;
}

/** تاريخ موعد الزيارة صالح: تاريخ حقيقي، لا أبعد من سنة ولا أقدم من سنة */
export function parseScheduledFor(value: unknown): string | null {
  if (typeof value !== "string" || !isRealISODate(value)) return null;
  const now = new Date();
  const future = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
  const past = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  const date = new Date(`${value}T00:00:00Z`);
  return date <= future && date >= past ? value : null;
}

// ————— درجات المعايير والدرجة الكلية —————

export type VisitScores = Record<string, { score: number; note?: string }>;

/** درجة معيار واحدة صحيحة ٠..٥ أو null (لم تُقيَّم) — أي شيء آخر NaN */
export function parseCriterionScore(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isInteger(num) && num >= 0 && num <= CRITERION_SCORE_MAX
    ? num
    : Number.NaN;
}

/** cleared: معايير أُرسلت صراحةً بـscore: null (طلب مسح درجتها) — تغيب حين لا يوجد مسح */
export type ParsedVisitScores = { ok: true; scores: VisitScores; cleared?: string[] } | { ok: false; error: string };

/**
 * يتحقّق من درجات الجسم بمعايير الجامع فقط: مفتاح غريب أو درجة خارج ٠..٥ أو
 * ملاحظة ليست نصاً = رفض. المعيار الغائب = لم يُقيَّم بعد (يسوّغ التخزين الجزئي).
 */
export function parseVisitScoresBody(body: unknown, criteria: VisitCriterion[]): ParsedVisitScores {
  if (body === null || body === undefined) return { ok: true, scores: {} };
  const raw = asObject(body);
  const known = new Set(criteria.map((c) => c.key));
  const byLabel = new Map(criteria.map((c) => [c.key, c.label]));
  const scores: VisitScores = {};
  const cleared: string[] = [];
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) return { ok: false, error: "معيار غير معروف" };
    const row = asObject(raw[key]);
    const score = parseCriterionScore(row.score);
    if (Number.isNaN(score)) {
      return { ok: false, error: `درجة «${byLabel.get(key)}» لازم تكون رقماً صحيحاً من ٠ إلى ${CRITERION_SCORE_MAX}` };
    }
    if (score === null) {
      // "لم يُقيَّم" — لا سطر لها في scores؛ والمسح الصريح (score: null) يُبلَّغ في cleared
      if (row.score === null) cleared.push(key);
      continue;
    }
    if (row.note !== undefined && typeof row.note !== "string") {
      return { ok: false, error: `ملاحظة «${byLabel.get(key)}» لازم تكون نصاً` };
    }
    scores[key] = row.note ? { score, note: row.note.trim().slice(0, VISIT_CRITERIA_NOTE_MAX) } : { score };
  }
  return cleared.length > 0 ? { ok: true, scores, cleared } : { ok: true, scores };
}

export type VisitTotal = { overallScore: number | null; scoredCount: number; complete: boolean };

/**
 * الدرجة الكلية ٠..١٠٠ = مجموع الدرجات ÷ (عدد المعايير × ٥) × ١٠٠، مقرَّبة.
 * لا تُحسب إلا إذا اكتملت كل المعايير (ناقصة = null) حتى لا تُعبَّأ تقريرُ
 * زيارةٍ منجزة بدرجة محرّفة بتقييم جزئي.
 */
export function computeOverallScore(criteria: VisitCriterion[], scores: VisitScores | Record<string, number>): VisitTotal {
  let sum = 0;
  let scoredCount = 0;
  for (const criterion of criteria) {
    const raw = scores[criterion.key];
    const score = typeof raw === "number" ? raw : typeof raw === "object" && raw !== null ? raw.score : undefined;
    if (typeof score === "number") {
      sum += score;
      scoredCount += 1;
    }
  }
  const complete = criteria.length > 0 && scoredCount === criteria.length;
  return {
    overallScore: complete ? Math.round((sum / (criteria.length * CRITERION_SCORE_MAX)) * 100) : null,
    scoredCount,
    complete,
  };
}

// ————— جسم جدولة زيارة —————

export type ParsedScheduleVisitBody =
  | { ok: true; mosqueId?: number; halaqahId: number; scheduledFor: string }
  | { ok: false; error: string };

/**
 * جسم جدولة زيارة: { halaqahId, scheduledFor, mosqueId? } — mosqueId لازم
 * فقط لجدولة الجمعية (يتحقَّق انتماؤه لها خادمياً)، ومدير الجامع لا يرسله
 * (جامعه من مسار الطلب نفسه).
 */
export function parseScheduleVisitBody(
  body: unknown,
  opts: { requireMosqueId: true },
): { ok: true; mosqueId: number; halaqahId: number; scheduledFor: string } | { ok: false; error: string };
export function parseScheduleVisitBody(
  body: unknown,
  opts?: { requireMosqueId?: false },
): { ok: true; mosqueId?: undefined; halaqahId: number; scheduledFor: string } | { ok: false; error: string };
export function parseScheduleVisitBody(body: unknown, opts: { requireMosqueId?: boolean } = {}): ParsedScheduleVisitBody {
  const raw = asObject(body);
  const halaqahId = typeof raw.halaqahId === "number" && Number.isInteger(raw.halaqahId) && raw.halaqahId > 0
    ? raw.halaqahId
    : null;
  if (halaqahId === null) return { ok: false, error: "معرّف الحلقة غير صالح" };
  const scheduledFor = parseScheduledFor(raw.scheduledFor);
  if (scheduledFor === null) return { ok: false, error: "موعد الزيارة لازم يكون تاريخاً حقيقياً ضمن سنة من اليوم" };

  if (opts.requireMosqueId) {
    const mosqueId =
      typeof raw.mosqueId === "number" && Number.isInteger(raw.mosqueId) && raw.mosqueId > 0 ? raw.mosqueId : null;
    if (mosqueId === null) return { ok: false, error: "معرّف الجامع غير صالح" };
    return { ok: true, mosqueId, halaqahId, scheduledFor };
  }
  return { ok: true, mosqueId: undefined, halaqahId, scheduledFor };
}

/** إجراء على زيارة قائمة: حفظ مسوّدة، إنهاء، إلغاء، أو إعادة فتح */
export type VisitAction = "save" | "done" | "cancel" | "reopen";

export function isVisitAction(value: unknown): value is VisitAction {
  return value === "save" || value === "done" || value === "cancel" || value === "reopen";
}
