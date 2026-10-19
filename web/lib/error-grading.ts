/*
  تقييم الورد بنقاط الأخطاء (ميزة error_grading) — منطق نقي بلا قاعدة بيانات
  يشاركه الخادم والواجهة والاختبارات. كل جامع يضبط أنواع الأخطاء وخصم كل نوع
  ودرجة الأساس وحدود التقدير (mosque_settings، مفتاح "error_grading")؛
  الافتراضيات بالكود تسري دائماً حين يغيب المخزون أو يتلف.

  الحساب بالهلل (×١٠٠ أعداداً صحيحة) فلا تتراكم أخطاء الفاصلة العائمة،
  والدرجة لا تنزل عن صفر. التقدير (band) يُخزَّن نصّاً مع الورد وقت التقييم
  فلا يتغيّر تاريخياً لو غيّر الجامع حدوده لاحقاً.
*/

export const ERROR_GRADING_FEATURE_KEY = "error_grading";
export const ERROR_GRADING_SETTING_KEY = "error_grading";

export const ERROR_TYPES_MAX = 12;
export const ERROR_BANDS_MIN = 2;
export const ERROR_BANDS_MAX = 8;
export const ERROR_COUNT_MAX = 50;
export const ERROR_LABEL_MAX = 40;
export const BASE_SCORE_MAX = 1000;
const POINTS_STEP_CENTS = 25; // الخصم بمضاعفات ٠٫٢٥

export type ErrorType = { key: string; label: string; points: number };
export type GradeBand = { label: string; min: number };
export type ErrorGradingConfig = {
  baseScore: number;
  errorTypes: ErrorType[];
  /** مرتبة تنازلياً بـmin، وآخرها min = 0 دائماً (تغطي كل الدرجات) */
  bands: GradeBand[];
};

export const DEFAULT_ERROR_GRADING_CONFIG: ErrorGradingConfig = {
  baseScore: 100,
  errorTypes: [
    { key: "hifz", label: "خطأ حفظ", points: 2 },
    { key: "hesitation", label: "تردد / تلقين", points: 1 },
    { key: "tajweed", label: "خطأ تجويد", points: 0.5 },
    { key: "tashkeel", label: "خطأ تشكيل", points: 0.5 },
  ],
  bands: [
    { label: "ممتاز", min: 90 },
    { label: "جيد جداً", min: 80 },
    { label: "جيد", min: 70 },
    { label: "مقبول", min: 60 },
    { label: "يحتاج إعادة", min: 0 },
  ],
};

export type ErrorCounts = Record<string, number>;

const cents = (n: number) => Math.round(n * 100);
const KEY_RE = /^[a-z][a-z0-9_]{0,29}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** يتحقق من إعدادات كاملة (جسم PUT الإداري): يرفض بدل أن يصحّح بصمت */
export function parseErrorGradingConfig(raw: unknown): Parsed<ErrorGradingConfig> {
  if (!isRecord(raw)) return { ok: false, error: "الإعدادات غير صحيحة" };

  const base = raw.baseScore;
  if (typeof base !== "number" || !Number.isInteger(base) || base < 1 || base > BASE_SCORE_MAX) {
    return { ok: false, error: `درجة الأساس عدد صحيح من 1 إلى ${BASE_SCORE_MAX}` };
  }

  if (!Array.isArray(raw.errorTypes) || raw.errorTypes.length < 1 || raw.errorTypes.length > ERROR_TYPES_MAX) {
    return { ok: false, error: `أنواع الأخطاء من 1 إلى ${ERROR_TYPES_MAX}` };
  }
  const errorTypes: ErrorType[] = [];
  const keys = new Set<string>();
  const labels = new Set<string>();
  for (const item of raw.errorTypes) {
    if (!isRecord(item)) return { ok: false, error: "نوع خطأ غير صحيح" };
    const key = item.key;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const points = item.points;
    if (typeof key !== "string" || !KEY_RE.test(key)) return { ok: false, error: "معرّف نوع الخطأ غير صحيح" };
    if (keys.has(key)) return { ok: false, error: "معرّفات أنواع الأخطاء مكرّرة" };
    if (label === "" || label.length > ERROR_LABEL_MAX) {
      return { ok: false, error: `اسم نوع الخطأ من 1 إلى ${ERROR_LABEL_MAX} حرفاً` };
    }
    if (labels.has(label)) return { ok: false, error: "أسماء أنواع الأخطاء مكرّرة" };
    if (typeof points !== "number" || !Number.isFinite(points) || points <= 0 || points > base) {
      return { ok: false, error: "خصم نوع الخطأ أكبر من صفر ولا يتجاوز درجة الأساس" };
    }
    if (cents(points) % POINTS_STEP_CENTS !== 0) return { ok: false, error: "الخصم بمضاعفات 0.25" };
    keys.add(key);
    labels.add(label);
    errorTypes.push({ key, label, points: cents(points) / 100 });
  }

  if (!Array.isArray(raw.bands) || raw.bands.length < ERROR_BANDS_MIN || raw.bands.length > ERROR_BANDS_MAX) {
    return { ok: false, error: `التقديرات من ${ERROR_BANDS_MIN} إلى ${ERROR_BANDS_MAX}` };
  }
  const bands: GradeBand[] = [];
  for (const item of raw.bands) {
    if (!isRecord(item)) return { ok: false, error: "تقدير غير صحيح" };
    const label = typeof item.label === "string" ? item.label.trim() : "";
    const min = item.min;
    if (label === "" || label.length > ERROR_LABEL_MAX) {
      return { ok: false, error: `اسم التقدير من 1 إلى ${ERROR_LABEL_MAX} حرفاً` };
    }
    if (typeof min !== "number" || !Number.isFinite(min) || min < 0 || min > base) {
      return { ok: false, error: "حدّ التقدير بين صفر ودرجة الأساس" };
    }
    bands.push({ label, min });
  }
  for (let i = 1; i < bands.length; i++) {
    if (bands[i].min >= bands[i - 1].min) return { ok: false, error: "حدود التقديرات تنازلية بلا تكرار" };
  }
  if (bands[bands.length - 1].min !== 0) return { ok: false, error: "آخر تقدير يبدأ من صفر ليغطي كل الدرجات" };
  if (new Set(bands.map((b) => b.label)).size !== bands.length) return { ok: false, error: "أسماء التقديرات مكرّرة" };

  return { ok: true, value: { baseScore: base, errorTypes, bands } };
}

/** المخزون (قد يكون ناقصاً أو تالفاً) → إعدادات صالحة دائماً: الافتراضيات عند أي خلل */
export function mergeErrorGradingConfig(stored: unknown): ErrorGradingConfig {
  const parsed = parseErrorGradingConfig(stored);
  return parsed.ok ? parsed.value : DEFAULT_ERROR_GRADING_CONFIG;
}

/** يتحقق من عدّادات الأخطاء من العميل: مفاتيح معروفة فقط وأعداد صحيحة 0–50؛ الأصفار تُحذف */
export function parseErrorCounts(config: ErrorGradingConfig, raw: unknown): Parsed<ErrorCounts> {
  if (!isRecord(raw)) return { ok: false, error: "عدّادات الأخطاء غير صحيحة" };
  const known = new Set(config.errorTypes.map((t) => t.key));
  const counts: ErrorCounts = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!known.has(key)) return { ok: false, error: "نوع خطأ غير معروف" };
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > ERROR_COUNT_MAX) {
      return { ok: false, error: `عدد الأخطاء من 0 إلى ${ERROR_COUNT_MAX}` };
    }
    if (value > 0) counts[key] = value;
  }
  return { ok: true, value: counts };
}

/** الدرجة = الأساس − مجموع (خصم النوع × عدده)، لا تنزل عن صفر، بخانتين عشريتين */
export function computeErrorScore(config: ErrorGradingConfig, counts: ErrorCounts): number {
  let deducted = 0;
  for (const type of config.errorTypes) deducted += cents(type.points) * (counts[type.key] ?? 0);
  return Math.max(0, cents(config.baseScore) - deducted) / 100;
}

/** أول تقدير (تنازلياً) تبلغ الدرجة حدّه الأدنى؛ وإلا آخر تقدير */
export function bandFor(config: ErrorGradingConfig, score: number): string {
  for (const band of config.bands) if (score >= band.min) return band.label;
  return config.bands[config.bands.length - 1].label;
}

export type WardGrade = { counts: ErrorCounts; score: number; band: string };

/** تحقق + حساب في خطوة واحدة — مصدر الحقيقة الوحيد؛ الخادم لا يقبل درجة من العميل أبداً */
export function gradeWard(config: ErrorGradingConfig, rawCounts: unknown): Parsed<WardGrade> {
  const parsed = parseErrorCounts(config, rawCounts);
  if (!parsed.ok) return parsed;
  const score = computeErrorScore(config, parsed.value);
  return { ok: true, value: { counts: parsed.value, score, band: bandFor(config, score) } };
}

/** متوسط الدرجات بخانة عشرية، أو null بلا درجات */
export function averageScore(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  const total = scores.reduce((sum, s) => sum + cents(s), 0);
  return Math.round(total / scores.length / 10) / 10;
}

/** "92.5" / "90" — بلا أصفار زائدة */
export function formatScore(score: number): string {
  return String(Math.round(score * 100) / 100);
}
