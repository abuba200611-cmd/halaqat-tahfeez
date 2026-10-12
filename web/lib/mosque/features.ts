/*
  سجل مزايا النظام — المصدر الوحيد للحقيقة. إضافة ميزة جديدة لاحقاً =
  إضافة سطر واحد هنا (+ صفحاتها)، وستظهر لكل الجوامع بإعداداتها تلقائياً.
  "ready" = متاحة الآن للتفعيل/التعطيل لكل جامع، "soon" = قادمة وتظهر
  كبطاقة "قريباً" معطّلة لا يمكن تفعيلها.
*/

export type FeatureStatus = "ready" | "soon";

export type Feature = {
  key: string;
  nameAr: string;
  descriptionAr: string;
  defaultEnabled: boolean;
  status: FeatureStatus;
};

export const FEATURES: readonly Feature[] = [
  {
    key: "halaqat",
    nameAr: "الحلقات",
    descriptionAr: "ربط حلقات الجامع بمعلّميها عبر رمز الدعوة، ومتابعة طلاب كل حلقة.",
    defaultEnabled: true,
    status: "ready",
  },
  {
    key: "registration",
    nameAr: "التسجيل العام",
    descriptionAr: "رابط عام يستقبل رغبات الطلاب الجدد، وتوزّعهم أنت على الحلقات.",
    defaultEnabled: true,
    status: "ready",
  },
  {
    key: "stats",
    nameAr: "الإحصائيات",
    descriptionAr: "لوحة أرقام حية لكل حلقة وللجامع كله، من نظام المعلّم مباشرة.",
    defaultEnabled: true,
    status: "ready",
  },
  {
    key: "brain",
    nameAr: "الدماغ",
    descriptionAr: "خريطة شبكية حية تُبنى تلقائياً من بيانات الجامع: حلقات ومعلّمون وطلاب وتسجيل.",
    defaultEnabled: true,
    status: "ready",
  },
  {
    key: "families",
    nameAr: "الأسر",
    descriptionAr: "تنظيم أسر الجامع ومتابعة أفرادها من الطلاب وأولياء الأمور.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "committees",
    nameAr: "اللجان",
    descriptionAr: "لجان الجامع وأعضاؤها ومهامها بلوحة متابعة بسيطة.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "weekly_evaluation",
    nameAr: "التقييم الأسبوعي",
    descriptionAr: "تقييم أسبوعي للطلاب والأسر بمعايير يحددها الجامع، مع ترتيب النتائج.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "archive",
    nameAr: "أرشيف الأنشطة",
    descriptionAr: "صور وروابط فيديو لأنشطة الجامع، مرتبة بالتاريخ وموسومة بالحلقة أو الأسرة أو اللجنة.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "badges",
    nameAr: "الأوسمة",
    descriptionAr: "أوسمة إنجاز وتحفيز تمنحها للطلاب والأسر والأعضاء، وتظهر بخرائط الدماغ.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "weekly_schedule",
    nameAr: "الجدول الأسبوعي",
    descriptionAr: "جدول الجامع الأسبوعي بالفترات والأوقات، مع رابط عام لمشاركته.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "reports",
    nameAr: "التقارير",
    descriptionAr: "تقارير دورية بأرقام الجامع، قابلة للطباعة والتصدير.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "honor_board",
    nameAr: "لوحة الشرف",
    descriptionAr: "ترتيب الحلقات والطلاب بدرجات التفاعل من نظام المعلّم وبرامج الجامع، مع منصّة المتصدّرين.",
    defaultEnabled: true,
    status: "ready",
  },
  {
    key: "agent",
    nameAr: "المساعد الذكي",
    descriptionAr: "مساعد ذكي يجيب عن بيانات الجامع وملاحظاته.",
    defaultEnabled: false,
    status: "soon",
  },
];

/** ميزة من السجل بمفتاحها، أو undefined إن كان المفتاح غير معروف */
export function getFeature(key: string): Feature | undefined {
  return FEATURES.find((feature) => feature.key === key);
}

/** حوّل حالات المزايا إلى خريطة {مفتاح: مفعّل؟} — "قريباً" دائماً غير مفعّلة */
export function effectiveFeatures(
  states: readonly { key: string; status: FeatureStatus; enabled: boolean }[],
): Record<string, boolean> {
  return Object.fromEntries(states.map((state) => [state.key, state.enabled && state.status === "ready"]));
}
