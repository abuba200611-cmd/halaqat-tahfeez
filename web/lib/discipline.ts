/*
  A2 — الانضباط والمتابعة: منطق نقي (بلا قاعدة بيانات) يشاركه الخادم
  والواجهة والاختبارات. سُلّم الغياب وسُلّم المخالفات وإعداداتهما كلها
  هنا — كل رقم قابل للضبط لكل جامع من مفتاح "discipline" في mosque_settings،
  وهذه الافتراضيات تسري عند غيابه (الجوامع تختلف).
*/

export const DISCIPLINE_FEATURE_KEY = "discipline";

export const DISCIPLINE_NOTE_MAX = 300;
export const DISCIPLINE_COMMITTEE_NOTE_MIN = 10;
export const DISCIPLINE_COMMITTEE_NOTE_MAX = 2000;
export const DISCIPLINE_CATEGORIES_MAX = 20;

// ————— الإعدادات —————

export type AbsenceConfig = {
  /** أيام غياب متتالية ← إنذار أول + إشعار ولي الأمر */
  warn1ConsecutiveDays: number;
  /** غيابات غير متتالية خلال الفصل ← إنذار ثانٍ */
  warn2TermAbsences: number;
  /** نافذة الفصل (أيام متدرّعة حتى اليوم) التي تُحسب فيها غيابات الفصل */
  termDays: number;
  /** فجوة تقويمية أكبر منها تقطع تتابع أيام الغياب (الحلقة قد تجتمع أياماً متباعدة) */
  consecutiveGapDays: number;
  /** أيام غياب متتالية ← استدعاء ولي الأمر وتعهد */
  summonsConsecutiveDays: number;
  /** العتبة الحرجة (أيام غياب متتالية) التي تُنبَّه عندها إدارة الجامع */
  adminAlertConsecutiveDays: number;
  /** نمط «حاضر افتراضياً»: كل من لم يُعلَّم يُعدّ حاضراً في ملخّصات الحضور فقط */
  defaultPresent: boolean;
};

export type ViolationsConfig = {
  /** تصنيفات المخالفات التي يختار منها المعلّم */
  categories: string[];
  /** كل كم مخالفة تُنجز درجة في السُلّم (1 = كل مخالفة درجة) */
  escalateEvery: number;
  /** مدة الإيقاف المؤقت بأيام عند درجة الإيقاف */
  suspensionDays: number;
};

export type DisciplineConfig = {
  absence: AbsenceConfig;
  violations: ViolationsConfig;
};

export const DEFAULT_DISCIPLINE_CONFIG: DisciplineConfig = {
  absence: {
    warn1ConsecutiveDays: 3,
    warn2TermAbsences: 10,
    termDays: 120,
    consecutiveGapDays: 7,
    summonsConsecutiveDays: 7,
    adminAlertConsecutiveDays: 7,
    defaultPresent: false,
  },
  violations: {
    categories: ["إخلال بالسلوك", "التأخر المتكرر", "إهمال الحفظ والمراجعة", "عدم الالتزام بالزي", "إيذاء الزملاء", "أخرى"],
    escalateEvery: 1,
    suspensionDays: 3,
  },
};

/** حدّ آمن: رقم صحيح ضمن [min, max] أو القيمة الافتراضية */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof num === "number" && Number.isInteger(num) && num >= min && num <= max ? num : fallback;
}

/** يدمج المخزون (JSON جزئي أو تالف) فوق الافتراضي مع تقييد كل قيمة بحدودها */
export function mergeDisciplineConfig(stored: unknown): DisciplineConfig {
  const source = (typeof stored === "object" && stored !== null && !Array.isArray(stored) ? stored : {}) as Record<string, unknown>;
  const absenceRaw = (typeof source.absence === "object" && source.absence !== null ? source.absence : {}) as Record<string, unknown>;
  const violationsRaw =
    (typeof source.violations === "object" && source.violations !== null ? source.violations : {}) as Record<string, unknown>;
  const d = DEFAULT_DISCIPLINE_CONFIG;
  return {
    absence: {
      warn1ConsecutiveDays: clampInt(absenceRaw.warn1ConsecutiveDays, 1, 60, d.absence.warn1ConsecutiveDays),
      warn2TermAbsences: clampInt(absenceRaw.warn2TermAbsences, 1, 365, d.absence.warn2TermAbsences),
      termDays: clampInt(absenceRaw.termDays, 7, 365, d.absence.termDays),
      consecutiveGapDays: clampInt(absenceRaw.consecutiveGapDays, 1, 60, d.absence.consecutiveGapDays),
      summonsConsecutiveDays: clampInt(absenceRaw.summonsConsecutiveDays, 1, 60, d.absence.summonsConsecutiveDays),
      adminAlertConsecutiveDays: clampInt(absenceRaw.adminAlertConsecutiveDays, 1, 60, d.absence.adminAlertConsecutiveDays),
      defaultPresent: absenceRaw.defaultPresent === true,
    },
    violations: {
      categories: Array.isArray(violationsRaw.categories)
        ? [
            ...new Set(
              violationsRaw.categories
                .filter((c): c is string => typeof c === "string")
                .map((c) => c.trim().slice(0, 50))
                .filter((c) => c !== ""),
            ),
          ].slice(0, DISCIPLINE_CATEGORIES_MAX)
        : [...d.violations.categories],
      escalateEvery: clampInt(violationsRaw.escalateEvery, 1, 10, d.violations.escalateEvery),
      suspensionDays: clampInt(violationsRaw.suspensionDays, 1, 60, d.violations.suspensionDays),
    },
  };
}

export type ParsedConfigBody = { ok: true; config: DisciplineConfig } | { ok: false; error: string };

/** يتحقّق من جسم PUT لإعدادات الانضباط: كائن واحد يُدمج فوق الافتراضي بحدود صارمة */
export function parseDisciplineConfigBody(body: unknown): ParsedConfigBody {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "الإعدادات غير صحيحة" };
  }
  const raw = body as Record<string, unknown>;
  const absence = (typeof raw.absence === "object" && raw.absence !== null ? raw.absence : {}) as Record<string, unknown>;
  const violations =
    (typeof raw.violations === "object" && raw.violations !== null ? raw.violations : {}) as Record<string, unknown>;

  const intFields: [Record<string, unknown>, string, number, number][] = [
    [absence, "warn1ConsecutiveDays", 1, 60],
    [absence, "warn2TermAbsences", 1, 365],
    [absence, "termDays", 7, 365],
    [absence, "consecutiveGapDays", 1, 60],
    [absence, "summonsConsecutiveDays", 1, 60],
    [absence, "adminAlertConsecutiveDays", 1, 60],
    [violations, "escalateEvery", 1, 10],
    [violations, "suspensionDays", 1, 60],
  ];
  const labels: Record<string, string> = {
    warn1ConsecutiveDays: "حدّ الإنذار الأول",
    warn2TermAbsences: "حدّ الإنذار الثاني",
    termDays: "أيام الفصل",
    consecutiveGapDays: "فجوة التتابع",
    summonsConsecutiveDays: "حدّ الاستدعاء",
    adminAlertConsecutiveDays: "حدّ تنبيه الإدارة",
    escalateEvery: "مخالفات لكل درجة",
    suspensionDays: "أيام الإيقاف",
  };
  for (const [obj, key, min, max] of intFields) {
    if (obj[key] === undefined) continue; // الحقول الغائبة تبقى على قيمتها بعد الدمج
    if (typeof obj[key] !== "number" || !Number.isInteger(obj[key]) || obj[key] < min || obj[key] > max) {
      return { ok: false, error: `${labels[key]} لازم يكون رقماً صحيحاً من ${min} إلى ${max}` };
    }
  }
  if (absence.defaultPresent !== undefined && typeof absence.defaultPresent !== "boolean") {
    return { ok: false, error: "نمط «حاضر افتراضياً» لازم يكون تشغيل/إيقاف" };
  }
  if (violations.categories !== undefined) {
    if (!Array.isArray(violations.categories)) return { ok: false, error: "التصنيفات لازم تكون قائمة" };
    const names = violations.categories.filter((c): c is string => typeof c === "string").map((c) => c.trim());
    if (names.some((c) => c === "")) return { ok: false, error: "تصنيف فارغ غير مسموح" };
    if (names.length === 0) return { ok: false, error: "لازم تصنيف واحد على الأقل" };
    if (names.length > DISCIPLINE_CATEGORIES_MAX) {
      return { ok: false, error: `الحدّ الأقصى ${DISCIPLINE_CATEGORIES_MAX} تصنيفاً` };
    }
    if (new Set(names).size !== names.length) return { ok: false, error: "تصنيفات مكرّرة غير مسموحة" };
  }
  return { ok: true, config: mergeDisciplineConfig(body) };
}

// ————— سُلّم الغياب —————

export type AbsenceDay = { date: string; status: "present" | "late" | "excused" | "absent" };

export type AbsenceStats = {
  /** أيام الغياب المتتالية الجارية الآن (تنقطع بحضور أو بفجوة تقويمية طويلة) */
  currentStreak: number;
  /** مجموع الغيابات خلال نافذة الفصل */
  termAbsences: number;
};

function daysBetweenISO(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

/**
 * إحصاء غياب طالب واحد من قرارات الحضور المخزَّنة (لا حضور ضمني هنا —
 * السُلّم يُبنى على الغياب الصريح المعلَّم فقط). `days` أي صيغة تاريخ.
 */
export function absenceStats(days: AbsenceDay[], today: string, config: AbsenceConfig): AbsenceStats {
  const sorted = days
    .filter((d) => d.date <= today)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  let currentStreak = 0;
  let previous: string | null = null;
  for (const day of sorted) {
    if (day.status !== "absent") break;
    if (previous !== null && daysBetweenISO(day.date, previous) > config.consecutiveGapDays) break;
    currentStreak += 1;
    previous = day.date;
  }

  const since = new Date(Date.parse(today) - (config.termDays - 1) * 86400000).toISOString().slice(0, 10);
  const termAbsences = sorted.filter((d) => d.date >= since && d.status === "absent").length;
  return { currentStreak, termAbsences };
}

export type AbsenceLadderAction = {
  kind: "absence_warning" | "parent_summons" | "admin_alert";
  level: number;
  /** إشعار ولي الأمر عند إنشاء الحدث فعلاً */
  notifyParent: boolean;
  reasonAr: string;
};

/** أفعال سُلّم الغياب الواجبة لهذه الإحصائية — قد تتزامن إنذار الفصل مع الاستدعاء */
export function absenceLadderActions(stats: AbsenceStats, config: AbsenceConfig): AbsenceLadderAction[] {
  const actions: AbsenceLadderAction[] = [];
  if (stats.currentStreak >= config.summonsConsecutiveDays) {
    actions.push({
      kind: "parent_summons",
      level: 1,
      notifyParent: true,
      reasonAr: `غياب متتالٍ ${stats.currentStreak} يوماً — استدعاء ولي الأمر وتعهد`,
    });
  } else if (stats.currentStreak >= config.warn1ConsecutiveDays) {
    actions.push({
      kind: "absence_warning",
      level: 1,
      notifyParent: true,
      reasonAr: `غياب متتالٍ ${stats.currentStreak} يوماً — إنذار أول`,
    });
  }
  if (stats.termAbsences >= config.warn2TermAbsences) {
    actions.push({
      kind: "absence_warning",
      level: 2,
      notifyParent: false,
      reasonAr: `${stats.termAbsences} غياباً خلال ${config.termDays} يوماً — إنذار ثانٍ`,
    });
  }
  if (stats.currentStreak >= config.adminAlertConsecutiveDays) {
    actions.push({
      kind: "admin_alert",
      level: 1,
      notifyParent: false,
      reasonAr: `عتبة حرجة: غياب متتالٍ ${stats.currentStreak} يوماً`,
    });
  }
  return actions;
}

// ————— سُلّم المخالفات —————

export type ViolationStep = { step: number; key: string; labelAr: string; docAr: string };

export const VIOLATION_STEPS: readonly ViolationStep[] = [
  { step: 1, key: "advice", labelAr: "مناصحة", docAr: "محضر مناصحة" },
  { step: 2, key: "signed_violation", labelAr: "مخالفة موقعة", docAr: "مخالفة موقعة" },
  { step: 3, key: "pledge", labelAr: "تعهد", docAr: "تعهد" },
  { step: 4, key: "parent_notice", labelAr: "إشعار ولي الأمر", docAr: "إشعار ولي الأمر" },
  { step: 5, key: "suspension", labelAr: "إيقاف مؤقت", docAr: "قرار إيقاف مؤقت" },
  { step: 6, key: "committee", labelAr: "رفع للجنة", docAr: "إحالة للجنة" },
];

/** الدرجة المقترحة بعد تسجيل المخالفة رقم `count` (الدرجة العليا = رفع للجنة) */
export function violationStepForCount(count: number, config: ViolationsConfig): number {
  const step = Math.ceil(count / Math.max(1, config.escalateEvery));
  return Math.min(VIOLATION_STEPS.length, Math.max(1, step));
}

export function violationStep(step: number): ViolationStep {
  return VIOLATION_STEPS[Math.min(VIOLATION_STEPS.length, Math.max(1, step)) - 1];
}

// ————— عرض الأحداث والمستندات —————

export type DisciplineEventKind = "absence_warning" | "parent_summons" | "admin_alert" | "violation" | "dismissal";

export const EVENT_KIND_LABEL: Record<DisciplineEventKind, string> = {
  absence_warning: "إنذار غياب",
  parent_summons: "استدعاء ولي الأمر",
  admin_alert: "تنبيه إداري",
  violation: "مخالفة",
  dismissal: "فصل نهائي",
};

/** عنوان الحدث كما يظهر للمستخدم — يجمع النوع مع درجته */
export function eventLabel(kind: DisciplineEventKind, level: number): string {
  if (kind === "absence_warning") return level >= 2 ? "إنذار غياب ثانٍ" : "إنذار غياب أول";
  if (kind === "violation") return `مخالفة — ${violationStep(level).labelAr}`;
  return EVENT_KIND_LABEL[kind];
}

export type DisciplineDocKind = "warning" | "pledge" | "summons";

export const DOC_KIND_LABEL: Record<DisciplineDocKind, string> = {
  warning: "خطاب إنذار",
  pledge: "تعهد",
  summons: "خطاب استدعاء ولي الأمر",
};

/** المستندات القابلة للطباعة لهذا الحدث — بعض الأحداث بلا مستند (مناصحة/تنبيه) */
export function docKindsForEvent(kind: DisciplineEventKind, level: number): DisciplineDocKind[] {
  if (kind === "parent_summons") return ["summons", "pledge"];
  if (kind === "absence_warning") return ["warning"];
  if (kind === "violation") {
    if (level === 2) return ["warning"];
    if (level === 3) return ["pledge"];
    if (level === 4) return ["summons"];
    if (level === 5) return ["summons", "pledge"];
    return [];
  }
  return [];
}

// ————— ملخّص حضور الشهر (لكشف المتابعة) —————

export type MonthAttendanceCounts = {
  present: number;
  late: number;
  excused: number;
  absent: number;
  unmarked: number;
};

export type StoredMonthAttendance = { studentId: string; date: string; status: AbsenceDay["status"] };

/**
 * عدّادات حضور الشهر لكل طالب. «الأيام المعلَّمة» = أيام اجتماع الحلقة
 * (كل يوم له أي صفّ حضور مخزَّن). بنمط «حاضر افتراضياً» يُعدّ الطالب
 * حاضراً في يوم اجتماع بلا قرار له؛ بدونه يبقى «غير مسجَّل».
 */
export function summarizeMonthAttendance(
  studentIds: string[],
  stored: StoredMonthAttendance[],
  defaultPresent: boolean,
): Record<string, MonthAttendanceCounts> {
  const metDays = new Set(stored.map((r) => r.date));
  const byStudent = new Map<string, Map<string, AbsenceDay["status"]>>();
  for (const row of stored) {
    const map = byStudent.get(row.studentId) ?? new Map<string, AbsenceDay["status"]>();
    map.set(row.date, row.status);
    byStudent.set(row.studentId, map);
  }

  const result: Record<string, MonthAttendanceCounts> = {};
  for (const studentId of studentIds) {
    const counts: MonthAttendanceCounts = { present: 0, late: 0, excused: 0, absent: 0, unmarked: 0 };
    const marks = byStudent.get(studentId);
    for (const date of metDays) {
      const status = marks?.get(date);
      if (status === undefined) counts[defaultPresent ? "present" : "unmarked"] += 1;
      else counts[status] += 1;
    }
    result[studentId] = counts;
  }
  return result;
}

// ————— CSV —————

/** سطر CSV بعلامات اقتباس مزدوجة — المحارف الخاصة تُهرَّب بمضاعفة علامة الاقتباس */
function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** كشف المتابعة الشهري بصيغة CSV (يفترض BOM يضيفه المستدعي عند التنزيل) */
export function sheetToCsv(
  header: string[],
  rows: (string | number)[][],
): string {
  const lines = [header.map(csvCell).join(","), ...rows.map((row) => row.map(csvCell).join(","))];
  return lines.join("\r\n");
}
