/*
  حسابات الاختبارات والشهادات البحتة (بلا قاعدة بيانات ولا "server-only") —
  قواعد الخصم والنجاح وضبط إعدادات الجامع (config ميزة exams بجدول
  mosque_features) وتسميات العرض. كل رقم افتراضي هنا قابل للتجاوز لكل جامع
  (ولاحقاً لكل جمعية) عبر JSON الإعدادات — الجمعيات تختلف أعرافها.
*/

import { HIJRI_MONTH_NAMES, hijriPartsOfISO } from "@/lib/hijri";

// ————— الأخطاء وخصوماتها —————

/** أنواع أخطاء التلاوة التي يعدّها الممتحن — المفاتيح تُخزَّن كما هي بالقاعدة */
export const ERROR_KINDS = ["jali", "khafi", "taraddud", "nisyan"] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];

export const ERROR_LABELS: Record<ErrorKind, string> = {
  jali: "لحن جلي",
  khafi: "لحن خفي",
  taraddud: "تردد",
  nisyan: "نسيان",
};

export type DeductionRules = Record<ErrorKind, number>;
export type ErrorCounts = Record<ErrorKind, number>;

// ————— إعدادات الجامع (config ميزة exams) —————

export type ExamConfig = {
  /** الدرجة العظمى الافتراضية لنوع اختبار جديد */
  maxScore: number;
  /** درجة النجاح الافتراضية (من الدرجات لا النسب) */
  passMark: number;
  /** نقاط الخصم عن كل وقعة من كل نوع خطأ */
  deductions: DeductionRules;
  /** سقف عدّاد كل نوع خطأ بشاشة التقييم (زر + لا يتجاوزه) */
  maxErrorCountPerKind: number;
  /** أعلى درجة عظمى/درجة نجاح يقبلها النظام لنوع */
  maxScoreCap: number;
  /** حدّ ترشيحات المعلّم في الساعة */
  nominationsPerHourPerTeacher: number;
  /** أكبر عدد أعضاء للجنة جلسة */
  committeeMaxMembers: number;
  /** بادئة رمز الشهادات (رمز التحقق الفريد) */
  certificatePrefix: string;
  /** حدّ طلبات التحقق من الشهادات في الدقيقة لكل IP */
  verifyRateLimitPerMinute: number;
};

/** الافتراضيات — أرقام معقولة يعمل بها أي جامع قبل أي ضبط */
export const DEFAULT_EXAM_CONFIG: ExamConfig = {
  maxScore: 100,
  passMark: 60,
  deductions: { jali: 5, khafi: 2, taraddud: 1, nisyan: 3 },
  maxErrorCountPerKind: 50,
  maxScoreCap: 1000,
  nominationsPerHourPerTeacher: 30,
  committeeMaxMembers: 9,
  certificatePrefix: "MOS",
  verifyRateLimitPerMinute: 30,
};

const PREFIX_PATTERN = /^[A-Za-z0-9]{0,12}$/;

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function parseDeductions(value: unknown, fallback: DeductionRules): DeductionRules {
  const source = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  const rules = { ...fallback };
  for (const kind of ERROR_KINDS) {
    rules[kind] = num(source[kind], fallback[kind], 0, DEFAULT_EXAM_CONFIG.maxScoreCap);
  }
  return rules;
}

/**
 * إعدادات مُصحَّحة من JSON مخزَّن: القيم الغائبة/غير الصالحة تسقط على
 * الافتراضي، فلا يكسر JSON يدوي معدَّل المسارات أبداً. نقطة التخصيص
 * الوحيدة للجامع (ولاحقاً للجمعية فوقه).
 */
export function parseExamConfig(input: unknown): ExamConfig {
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const cap = num(source.maxScoreCap, DEFAULT_EXAM_CONFIG.maxScoreCap, 10, 1000);
  return {
    maxScore: num(source.maxScore, DEFAULT_EXAM_CONFIG.maxScore, 1, cap),
    passMark: num(source.passMark, DEFAULT_EXAM_CONFIG.passMark, 1, cap),
    deductions: parseDeductions(source.deductions, DEFAULT_EXAM_CONFIG.deductions),
    maxErrorCountPerKind: num(source.maxErrorCountPerKind, DEFAULT_EXAM_CONFIG.maxErrorCountPerKind, 1, 500),
    maxScoreCap: cap,
    nominationsPerHourPerTeacher: num(
      source.nominationsPerHourPerTeacher,
      DEFAULT_EXAM_CONFIG.nominationsPerHourPerTeacher,
      1,
      1000,
    ),
    committeeMaxMembers: num(source.committeeMaxMembers, DEFAULT_EXAM_CONFIG.committeeMaxMembers, 1, 30),
    certificatePrefix:
      typeof source.certificatePrefix === "string" && PREFIX_PATTERN.test(source.certificatePrefix)
        ? source.certificatePrefix
        : DEFAULT_EXAM_CONFIG.certificatePrefix,
    verifyRateLimitPerMinute: num(
      source.verifyRateLimitPerMinute,
      DEFAULT_EXAM_CONFIG.verifyRateLimitPerMinute,
      1,
      600,
    ),
  };
}

// ————— حساب الدرجة والنجاح —————

/**
 * قواعد خصم نوع اختبار من مدخلات المستخدم: مفاتيح الأخطاء المعروفة فقط
 * بقيم صحيحة ≥ 0 ضمن السقف — null عند أي مفتاح مجهول أو قيمة غير صالحة.
 */
export function parseErrorRulesInput(value: unknown, cap: number): Partial<DeductionRules> | null {
  if (typeof value !== "object" || value === null) return {};
  const source = value as Record<string, unknown>;
  const rules: Partial<DeductionRules> = {};
  for (const key of Object.keys(source)) {
    if (!(ERROR_KINDS as readonly string[]).includes(key)) return null;
    const points = source[key];
    if (typeof points !== "number" || !Number.isInteger(points) || points < 0 || points > cap) return null;
    rules[key as ErrorKind] = points;
  }
  return rules;
}

/** عدّادات أخطاء مُصحَّحة (أعداد صحيحة ≥ 0 ضمن السقف) أو null */
export function parseErrorCounts(input: unknown, maxPerKind: number): ErrorCounts | null {
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const counts = { jali: 0, khafi: 0, taraddud: 0, nisyan: 0 };
  for (const key of Object.keys(source)) {
    if (!(ERROR_KINDS as readonly string[]).includes(key)) continue;
    const value = source[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > maxPerKind) return null;
    counts[key as ErrorKind] = value;
  }
  return counts;
}

export type ExamScore = { score: number; passed: boolean; deductionsTotal: number };

/**
 * الدرجة = العظمى − مجموع (عدد كل خطأ × خصمه)، لا تقل عن صفر؛ والنجاح =
 * بلوغ درجة النجاح. حساب خالص يُطبَّق خادمياً عند التسجيل وعرضياً بالشاشة.
 */
export function scoreExam(rules: { maxScore: number; passMark: number; deductions: DeductionRules }, errors: ErrorCounts): ExamScore {
  const deductionsTotal = ERROR_KINDS.reduce((sum, kind) => sum + errors[kind] * rules.deductions[kind], 0);
  const score = Math.max(0, rules.maxScore - deductionsTotal);
  return { score, passed: score >= rules.passMark, deductionsTotal };
}

// ————— نطاق الأجزاء —————

/** نطاق أجزاء صالح مطابق لعدد أجزاء النوع — أو رسالة خطأ عربية */
export function validateJuzRange(from: unknown, to: unknown, juzCount: number): { from: number; to: number } | { error: string } {
  const start = typeof from === "number" ? from : Number(from);
  const end = typeof to === "number" ? to : Number(to);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > 30 || start > end) {
    return { error: "نطاق الأجزاء غير صحيح (١–٣٠ ومن الأول إلى الأخير)" };
  }
  if (end - start + 1 !== juzCount) {
    return { error: `نطاق هذا الاختبار يجب أن يكون ${juzCount} ${juzCount === 1 ? "جزءاً واحداً" : "أجزاء"}` };
  }
  return { from: start, to: end };
}

/** «الجزء 30» أو «الأجزاء 26–30» — لتسمية نطاق بلا كلمة حفظ */
export function juzRangeLabel(from: number, to: number): string {
  return from === to ? `الجزء ${from}` : `الأجزاء ${from}–${to}`;
}

/** إنجاز الشهادة: «حفظ الجزء ٣٠»، «حفظ الأجزاء ٢٦–٣٠»، «ختم القرآن الكريم» */
export function achievementText(from: number, to: number): string {
  if (from === 1 && to === 30) return "ختم القرآن الكريم";
  return `حفظ ${juzRangeLabel(from, to)}`;
}

// ————— الأنواع الافتراضية (تُبذَر عند أول استخدام) —————

export const DEFAULT_EXAM_TYPES: readonly { name: string; juzCount: number }[] = [
  { name: "اختبار جزء", juzCount: 1 },
  { name: "اختبار خمسة أجزاء", juzCount: 5 },
  { name: "اختبار عشرة أجزاء", juzCount: 10 },
  { name: "اختبار ختم", juzCount: 30 },
];

// ————— تسميات العرض —————

export type NominationStatus = "pending" | "scheduled" | "done" | "withdrawn";

export const NOMINATION_STATUS_LABELS: Record<NominationStatus, string> = {
  pending: "بانتظار الجدولة",
  scheduled: "مجدول",
  done: "مسجَّل",
  withdrawn: "مسحوب",
};

export type CertificateKind = "student_exam" | "teacher_service" | "student_enrollment";

export const CERTIFICATE_KIND_LABELS: Record<CertificateKind, string> = {
  student_exam: "شهادة إنجاز",
  teacher_service: "شهادة خدمة معلّم",
  student_enrollment: "تعريف طالب",
};

export function isCertificateKind(value: unknown): value is CertificateKind {
  return value === "student_exam" || value === "teacher_service" || value === "student_enrollment";
}

/** «14 ربيع الآخر 1448 هـ» — التاريخ الهجري ليوم ميلادي YYYY-MM-DD */
export function hijriDateLabel(iso: string): string {
  const { year, month, day } = hijriPartsOfISO(iso);
  return `${day} ${HIJRI_MONTH_NAMES[month - 1]} ${year} هـ`;
}
