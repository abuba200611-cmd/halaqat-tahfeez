/*
  فئة الحلقة العمرية (001): مصدر الحقيقة الواحد لملف نمط كل فئة — وحدة
  الإدخال/العرض، من يسجّل الورد، سياسة الاعتماد، تفعيل النقاط، وإظهار
  الكبرى/الصغرى. كل المسارات والواجهات تقرأ هذا الملف فقط (الدستور VI).
  العمود NULL بقاعدة البيانات = ملف legacy الذي يطابق السلوك الحالي
  حرفياً، فتبقى الحلقات القائمة بلا أي تغيير حتى يختار المشرف فئة (SC-005).
*/

export const STAGES = ["primary", "intermediate", "secondary", "university"] as const;
export type HalaqahStage = (typeof STAGES)[number];

export type WardUnit = "surah_ayah" | "ayah_page" | "page_wajh" | "wajh_juz";

export type StageProfile = {
  stage: HalaqahStage | "legacy"; // "legacy" = العمود NULL
  labelAr: string;
  unit: WardUnit; // وحدة الإدخال والعرض — التخزين سورة/آية + صفحات دائماً
  teacherRecords: boolean; // المعلّم يسجّل الورد عن الطالب (primary فقط)
  autoApproveOnTeacherRecord: boolean;
  /** اعتماد ورد الطالب: يدوي كما اليوم، أو عبر طابور التسميع (002، الجامعي) */
  studentSelfApproval: "manual" | "queue";
  pointsDefault: boolean; // primary فقط افتراضياً (قابل للتجاوز من إعداد الجامع)
  reviewTracksDefault: boolean; // primary=false، الباقي true، legacy=true (السلوك الحالي)
  queueDefault: boolean; // university=true (يستعمله 002)
};

export const STAGE_LABEL_AR: Record<HalaqahStage, string> = {
  primary: "ابتدائي",
  intermediate: "متوسط",
  secondary: "ثانوي",
  university: "جامعي وكبار",
};

/** تسمية الحلقة بلا فئة بالإعدادات — «الفئة الافتراضية مطبّقة» (US1 سيناريو ١) */
export const LEGACY_STAGE_LABEL_AR = "افتراضي";

const PROFILES: Record<HalaqahStage, StageProfile> = {
  // الابتدائي: سور وآيات، المعلّم يسجّل عن الطالب فيُحفظ معتمداً، نجوم
  // تحفيزية، ولا كبرى/صغرى. لو أرسل الطالب بنفسه (له حساب) فكأي ورد
  // طالب: يبدأ new ويُعتمد يدوياً (فرق الحافة FR-005 يحرس التكرار).
  primary: {
    stage: "primary",
    labelAr: STAGE_LABEL_AR.primary,
    unit: "surah_ayah",
    teacherRecords: true,
    autoApproveOnTeacherRecord: true,
    studentSelfApproval: "manual",
    pointsDefault: true,
    reviewTracksDefault: false,
    queueDefault: false,
  },
  intermediate: {
    stage: "intermediate",
    labelAr: STAGE_LABEL_AR.intermediate,
    unit: "ayah_page",
    teacherRecords: false,
    autoApproveOnTeacherRecord: false,
    studentSelfApproval: "manual",
    pointsDefault: false,
    reviewTracksDefault: true,
    queueDefault: false,
  },
  secondary: {
    stage: "secondary",
    labelAr: STAGE_LABEL_AR.secondary,
    unit: "page_wajh",
    teacherRecords: false,
    autoApproveOnTeacherRecord: false,
    studentSelfApproval: "manual",
    pointsDefault: false,
    reviewTracksDefault: true,
    queueDefault: false,
  },
  // الجامعي: أوجه وأجزاء، والاعتماد عبر طابور التسميع (002) والمسار اليدوي يبقى متاحاً
  university: {
    stage: "university",
    labelAr: STAGE_LABEL_AR.university,
    unit: "wajh_juz",
    teacherRecords: false,
    autoApproveOnTeacherRecord: false,
    studentSelfApproval: "queue",
    pointsDefault: false,
    reviewTracksDefault: true,
    queueDefault: true,
  },
};

/** النمط الحالي قبل الميزة: آيات وصفحات، اعتماد يدوي، كبرى/صغرى ظاهرة — بلا نقاط ولا طابور */
const LEGACY_PROFILE: StageProfile = {
  stage: "legacy",
  labelAr: LEGACY_STAGE_LABEL_AR,
  unit: "ayah_page",
  teacherRecords: false,
  autoApproveOnTeacherRecord: false,
  studentSelfApproval: "manual",
  pointsDefault: false,
  reviewTracksDefault: true,
  queueDefault: false,
};

/** ملف فئة الحلقة — null/undefined (العمود NULL) يرجع ملف legacy */
export function profileFor(stage: HalaqahStage | null | undefined): StageProfile {
  return stage ? PROFILES[stage] : LEGACY_PROFILE;
}

/**
 * يتحقق من قيمة فئة واردة من الخارج (جسم طلب أو صف قاعدة): يقبل null
 * (بلا فئة) والقيم الأربع فقط، ويرفض أي شيء آخر بخطأ عربي — المسار
 * يحوّله إلى 400.
 */
export function parseStage(value: unknown): HalaqahStage | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && (STAGES as readonly string[]).includes(value)) {
    return value as HalaqahStage;
  }
  throw new Error("قيمة الفئة غير صحيحة");
}
