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
    descriptionAr: "لوحة أرقام حية لكل حلقة وللجامع كله، من قاعدة الحلقات مباشرة.",
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
    descriptionAr: "ترتيب الحلقات والطلاب بدرجات التفاعل في الحلقات وبرامج الجامع، مع منصّة المتصدّرين.",
    defaultEnabled: true,
    status: "ready",
  },
  {
    key: "agent",
    nameAr: "المساعد الذكي",
    descriptionAr: "مساعد MOS: يجيب عن بيانات الجامع من أقسامها، ويقترح إجراءات لا تُنفَّذ إلا بموافقتك.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "exams",
    nameAr: "الاختبارات والشهادات",
    descriptionAr: "ترشيح الطلاب لاختبارات الحفظ، وجلسات بلجان ممتحنة، ونتائج تصل للطالب وولي الأمر، وشهادات قابلة للتحقق.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "discipline",
    nameAr: "الانضباط والمتابعة",
    descriptionAr:
      "سُلّم غياب ومخالفات متدرّج بإشعار الأولياء، وخطابات وتعهّدات قابلة للطباعة، وكشف متابعة شهري لكل حلقة.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "permits",
    nameAr: "تصاريح الحلقات",
    descriptionAr:
      "تصريح لكل حلقة بالعام الدراسي: إصدار وتجديد وإيقاف وسحب يدوي مسجَّل، مع اقتراحات تلقائية (قلة الطلاب، موعد التجديد، الترقية إلى مجمع).",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "teacher_eval",
    nameAr: "تقييم المعلّمين والحوافز",
    descriptionAr:
      "نموذج تقييم سنوي/فصلي لكل معلّم بمعايير وأوزان يضبطها الجامع، ومؤشرات تُملأ تلقائياً، وتوصية بالتجديد، وتقرير حوافز للعرض والطباعة.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "whatsapp",
    nameAr: "إشعارات واتساب",
    descriptionAr:
      "رسائل واتساب بأرقام معتمدة (قوالب) لأولياء الأمور عند اعتماد الأوراد وإنذارات الغياب ونتائج الاختبارات وإصدار الشهادات — بموافقة صريحة من ولي الأمر وسقف يومي لكل جامع وكل رقم.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "messaging",
    nameAr: "المراسلة الداخلية",
    descriptionAr:
      "محادثات داخل التطبيق بين المعلّم وأولياء الأمور والطلاب، وبين إدارة الجامع والمعلّمين — نص فقط بلا HTML، مع عدّاد غير مقروء وإشعارات فورية.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "juz_progress",
    nameAr: "تقدّم الأجزاء وتصنيف المراجعة",
    descriptionAr:
      "شريط تقدّم الحفظ بالأجزاء (شبكة ٣٠ جزءاً) في لوحات الطالب وولي الأمر والمعلّم، مع تصنيف المراجعة اليومية: سبق وسبقي ومنزل، وعدّادات لآخر ٧ و٣٠ يوماً. عرض قراءة فقط.",
    defaultEnabled: true,
    status: "ready",
  },
  {
    key: "supervisor_visits",
    nameAr: "زيارات المشرف التربوي",
    descriptionAr:
      "جدولة زيارات المشرفين لحلقات الجامع وتسجيلها: تقييم بمعايير يضبطها الجامع، درجة كلية، ملاحظات وتوصيات، وتقرير قابل للطباعة يراه معلّم الحلقة.",
    defaultEnabled: false,
    status: "ready",
  },
  {
    key: "fees",
    nameAr: "الرسوم والاشتراكات",
    descriptionAr:
      "تسجيل الرسوم والاشتراكات (خطط، مستحقات لكل فترة، دفعات وإيصالات قابلة للطباعة، إعفاءات، تصدير CSV) — سجل يدوي فقط بلا بوابة دفع، ويراه ولي الأمر قراءةً فقط والمعلّم كحالة.",
    defaultEnabled: false,
    status: "ready",
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
