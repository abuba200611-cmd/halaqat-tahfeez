/*
  خريطة قوالب واتساب — الأسماء هنا هي نفسها التي يسجّلها مالك المنصة في
  Meta Business Manager حرفياً (المستند الكامل بجانب هذا الملف: TEMPLATES.md).
  الرسائل المبدوءة من المنصة (business-initiated) لا تكون إلا قوالب
  معتمدة، فلا نص حرّ إطلاقاً. معاملات كل قالب مرتّبة كما تظهر به
  ({{1}} ثم {{2}} …) — المزوّد يرسلها بهذا الترتيب الموضعي حصراً، وأي
  تعديل هنا يلزمه تعديل القالب لدى Meta والعكس.
*/

export type WhatsappTemplateKey =
  | "ward_approved"
  | "ward_needs_revision"
  | "absence_warning"
  | "parent_summons"
  | "exam_result"
  | "certificate_issued"
  | "optin_confirm";

export type WhatsappTemplateSpec = {
  /** اسم القالب كما سُجّل لدى Meta (لا يقبل حروفاً عربية) */
  name: string;
  /** رمز لغة التسجيل لدى Meta */
  lang: string;
  /** أسماء معاملات الكود بالترتيب الموضعي الذي تُرسل به */
  params: readonly string[];
};

export const WHATSAPP_TEMPLATES: Readonly<Record<WhatsappTemplateKey, WhatsappTemplateSpec>> = {
  ward_approved: {
    name: "halaqa_ward_approved",
    lang: "ar",
    params: ["student_name"],
  },
  ward_needs_revision: {
    name: "halaqa_ward_needs_revision",
    lang: "ar",
    params: ["student_name"],
  },
  absence_warning: {
    name: "halaqa_absence_warning",
    lang: "ar",
    params: ["student_name"],
  },
  parent_summons: {
    name: "halaqa_parent_summons",
    lang: "ar",
    params: ["student_name"],
  },
  exam_result: {
    name: "halaqa_exam_result",
    lang: "ar",
    params: ["student_name", "exam_name", "result"],
  },
  certificate_issued: {
    name: "halaqa_certificate_issued",
    lang: "ar",
    params: ["student_name", "certificate_code"],
  },
  // رمز تأكيد ملكية الرقم قبل الموافقة (يُرسل مباشرة لا عبر الصادر)
  optin_confirm: {
    name: "halaqa_optin_confirm",
    lang: "ar",
    params: ["code"],
  },
};

/** أسماء القوالب بمفاتيحها للعرض بلوحة المطوّر */
export const WHATSAPP_TEMPLATE_LABELS: Readonly<Record<WhatsappTemplateKey, string>> = {
  ward_approved: "اعتماد ورد",
  ward_needs_revision: "ورد يحتاج مراجعة",
  absence_warning: "إنذار غياب",
  parent_summons: "استدعاء ولي أمر",
  exam_result: "نتيجة اختبار",
  certificate_issued: "إصدار شهادة",
  optin_confirm: "رمز تأكيد الرقم",
};
