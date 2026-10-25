import type { ComponentType } from "react";
import { FEATURES } from "@/lib/mosque/features";
import {
  ArrowUpIcon,
  BellIcon,
  BookIcon,
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  ClipboardIcon,
  EyeIcon,
  HelpIcon,
  HomeIcon,
  MessageIcon,
  MicIcon,
  PlayIcon,
  PlusIcon,
  ShuffleIcon,
  StarIcon,
  UsersIcon,
} from "@/components/icons";

/*
  جولة المنتج الكاملة في /welcome — كل ميزة حقيقية من سجل المزايا
  (lib/mosque/features.ts) بجملة واحدة واضحة + أيقونة، مجمّعة بجمهورها،
  مع مزايا النواة التي ليست في السجل (الأوراد، الخطة الشهرية، …).
  الاختبار tests/feature-tour.test.ts يضمن عدم سقوط أي ميزة من السجل.
*/

export type TourItem = { icon: ComponentType<{ size?: number }>; title: string; text: string; featureKey?: string };

/** جملة واحدة مختصرة لمفتاح من السجل — descriptionAr الأصلية أطول من جملة */
const SHORT: Record<string, string> = {
  halaqat: "ربط حلقات الجامع بمعلّميها عبر رمز دعوة، ومتابعة طلاب كل حلقة.",
  registration: "رابط عام يستقبل رغبات الطلاب الجدد، وتوزّعهم أنت على الحلقات.",
  stats: "لوحة أرقام حية لكل حلقة وللجامع كله، من قاعدة الحلقات مباشرة.",
  brain: "خريطة شبكية حية تُبنى تلقائياً من بيانات الجامع.",
  families: "تنظيم أسر الجامع ومتابعة أفرادها من الطلاب وأولياء الأمور.",
  committees: "لجان الجامع وأعضاؤها ومهامها بلوحة متابعة بسيطة.",
  weekly_evaluation: "تقييم أسبوعي للطلاب والأسر بمعايير يحددها الجامع.",
  archive: "صور وفيديوهات أنشطة الجامع موسومة بالحلقة أو الأسرة أو اللجنة.",
  badges: "أوسمة إنجاز تُمنح للطلاب والأسر وتظهر في ملفاتهم.",
  weekly_schedule: "جدول الجامع الأسبوعي بالفترات والأوقات مع رابط عام للمشاركة.",
  reports: "تقارير دورية بأرقام الجامع قابلة للطباعة والتصدير.",
  honor_board: "ترتيب الحلقات والطلاب بدرجات التفاعل مع منصّة المتصدّرين.",
  agent: "مساعد يجيب عن بيانات الجامع ويقترح إجراءات لا تُنفَّذ إلا بموافقتك.",
  exams: "ترشيح لاختبارات الحفظ، جلسات بلجان، ونتائج وشهادات قابلة للتحقق.",
  discipline: "سُلّم غياب ومخالفات متدرّج بإشعار الأولياء وخطابات للطباعة.",
  permits: "إصدار وتجديد وإيقاف تصاريح الحلقات مع اقتراحات تلقائية.",
  teacher_eval: "تقييم سنوي لكل معلّم بمؤشرات تلقائية وتقرير حوافز للطباعة.",
  whatsapp: "رسائل واتساب معتمدة لأولياء الأمور — بموافقتهم وبسقف يومي.",
  messaging: "محادثات داخل التطبيق بين المعلّم والأولياء والإدارة.",
  juz_progress: "شبكة ٣٠ جزءاً لتقدّم الحفظ مع تصنيف سبق وسبقي ومنزل.",
  supervisor_visits: "جدولة زيارات المشرفين وتقييمها وتقاريرها القابلة للطباعة.",
  fees: "خطط رسوم ومستحقات ودفعات بإيصالات قابلة للطباعة وتصدير CSV.",
  auto_assign: "توزيع آلي للتسجيلات على أنسب حلقة فيها مقعد، وقائمة انتظار مرتّبة.",
  error_grading: "عدّ أخطاء الورد بأنواعها فتُحسب الدرجة والتقدير فورياً.",
  student_import: "رفع ملف إكسل لإضافة طلاب دفعة واحدة مع معاينة الأخطاء.",
  qr_attendance: "رمز QR يتجدد كل ٣٠ ثانية يمسحه الطلاب لتسجيل حضورهم.",
  integrations: "مفاتيح API للقراءة وويب هوكس موقَّعة وتصدير CSV لربط بيانات الجامع بأنظمتك.",
};

/** عنصر جولة لمفتاح من السجل: الاسم من السجل والجملة من الخريطة أعلاه */
function fromRegistry(key: string, icon: TourItem["icon"], text?: string): TourItem {
  const feature = FEATURES.find((f) => f.key === key);
  if (!feature) throw new Error(`مفتاح ميزة غير معروف في جولة المنتج: ${key}`);
  return { icon, title: feature.nameAr, text: text ?? SHORT[key], featureKey: key };
}

export type TourGroup = { id: string; title: string; blurb: string; items: TourItem[] };

export const TOUR_GROUPS: readonly TourGroup[] = [
  {
    id: "teacher",
    title: "للمعلّم",
    blurb: "يوم المعلّم كله في شاشة واحدة",
    items: [
      { icon: CheckCircleIcon, title: "الأوراد والاعتماد", text: "يسجّل ورد كل طالب يومياً (سبق وسبقي ومنزل) ويعتمده بضغطة فيصل الطالب وولي الأمر فوراً." },
      { icon: CalendarIcon, title: "الحضور والغياب", text: "تحضير الحلقة كاملة بنقرة مع ملخص أسبوعي لكل طالب." },
      fromRegistry("qr_attendance", ClipboardIcon),
      fromRegistry("error_grading", ChartIcon),
      { icon: CalendarIcon, title: "الخطة الشهرية", text: "خطة حفظ ومراجعة شهرية لكل حلقة تُقارن بها إنجازات الطلاب يوماً بيوم." },
      { icon: ClipboardIcon, title: "دراسة الحالة", text: "ملف تربوي للطالب المتعثر: تشخيص وخطوات علاج ومتابعة حتى التحسن." },
      fromRegistry("student_import", PlusIcon),
      fromRegistry("messaging", MessageIcon),
    ],
  },
  {
    id: "student",
    title: "للطالب",
    blurb: "يعرف ما عليه ويرى تقدّمه بنفسه",
    items: [
      { icon: BookIcon, title: "وردي اليومي", text: "يرى الطالب ورده اليوم وما عليه إنجازه بوضوح." },
      fromRegistry("juz_progress", ChartIcon),
      { icon: MicIcon, title: "التلاوات الصوتية", text: "يرفع تلاوته صوتياً ليسمعها معلّمه ويتقيّمها." },
      fromRegistry("exams", CheckCircleIcon),
      fromRegistry("honor_board", StarIcon),
      fromRegistry("badges", ArrowUpIcon),
      { icon: UsersIcon, title: "زملاء الحلقة", text: "قائمة زملائه في الحلقة تعزز روح الجماعة، ويتحكم المعلّم بظهورها." },
    ],
  },
  {
    id: "parent",
    title: "لوليّ الأمر",
    blurb: "يطمئن على ابنه دون سؤال أحد",
    items: [
      { icon: ChartIcon, title: "تقرير الابن", text: "حفظه وحضوره وتقييماته وإشعاراته في تقرير واحد محدّث لحظة بلحظة." },
      fromRegistry("whatsapp", MessageIcon),
      { icon: BellIcon, title: "إشعارات الجوال", text: "إشعار فوري على جواله عند اعتماد الورد أو الغياب أو النتيجة." },
      fromRegistry("fees", ClipboardIcon),
      fromRegistry("discipline", BellIcon),
      fromRegistry("messaging", MessageIcon, "محادثة مباشرة مع معلّم ابنه نصاً فقط وبإشعارات فورية."),
    ],
  },
  {
    id: "mosque",
    title: "لمدير الجامع",
    blurb: "الجامع كله من لوحة واحدة",
    items: [
      fromRegistry("halaqat", UsersIcon),
      fromRegistry("registration", PlusIcon),
      fromRegistry("auto_assign", ShuffleIcon),
      fromRegistry("stats", ChartIcon),
      fromRegistry("brain", HelpIcon, "خريطة شبكية حية تُبنى تلقائياً من حلقات الجامع ومعلّميه وطلابه."),
      fromRegistry("permits", CheckCircleIcon),
      fromRegistry("teacher_eval", StarIcon),
      fromRegistry("weekly_schedule", CalendarIcon),
      fromRegistry("weekly_evaluation", ArrowUpIcon),
      fromRegistry("families", HomeIcon),
      fromRegistry("committees", UsersIcon, "لجان الجامع وأعضاؤها ومهامها بلوحة متابعة بسيطة."),
      fromRegistry("reports", ClipboardIcon),
      fromRegistry("archive", PlayIcon),
      fromRegistry("agent", HelpIcon),
      fromRegistry("integrations", ClipboardIcon),
    ],
  },
  {
    id: "association",
    title: "للجمعية",
    blurb: "صورة كاملة لأثر كل جوامعها",
    items: [
      { icon: ChartIcon, title: "مؤشرات كل الجوامع", text: "لوحة مؤشرات مجمّعة: حضور وحفظ واختبارات وتصاريح لكل جامع." },
      { icon: ClipboardIcon, title: "تقارير مجمّعة", text: "تقرير واحد لأثر الجمعية كاملاً بتصدير CSV." },
      fromRegistry("supervisor_visits", CalendarIcon),
      { icon: UsersIcon, title: "ربط الجوامع", text: "ربط كل جامع بالجمعية بطلب وموافقة من الطرفين، بلا وسطاء." },
    ],
  },
  {
    id: "platform",
    title: "التكامل والأمان",
    blurb: "يعمل مع أدواتكم ويحمي بياناتكم",
    items: [
      { icon: ShuffleIcon, title: "الربط مع الأنظمة الأخرى", text: "تكامل مع كلاسيرا وخيركم لتبادل البيانات دون إدخال مزدوج." },
      { icon: PlayIcon, title: "التطبيق على الجوال", text: "ثبّت السلام كتطبيق على الجوال يعمل بلا متجر تطبيقات." },
      { icon: EyeIcon, title: "الوضع الداكن", text: "مظهر داكن مريح للعين يتبع إعداد جهازك تلقائياً." },
      { icon: CheckCircleIcon, title: "صلاحيات لكل دور", text: "كل مستخدم يرى ما يخص دوره فقط، وبيانات القاصرين لا تُعرض للعامة." },
    ],
  },
];

export type FaqItem = { q: string; a: string; link?: { href: string; label: string } };

export const FAQ: readonly FaqItem[] = [
  {
    q: "كيف أسجّل جامعي؟",
    a: "اضغط «ابدأ تسجيل جامعك» واملأ نموذج تسجيل الجامع باسمه ومدينته واسم مستخدم وكلمة مرور لمديره. بعد مراجعة الطلب والموافقة عليه تدخل بحساب مدير الجامع، وتنشئ حلقاتك وترسل لمعلّميك رموز الدعوة.",
    link: { href: "/register-mosque", label: "تسجيل جامع" },
  },
  {
    q: "كيف أسجّل جمعيتي؟",
    a: "من صفحة تسجيل الجمعيات: أرسل طلباً باسم الجمعية وبيانات مسؤولها. بعد الموافقة يُنشأ حساب مدير الجمعية، فتربطون الجوامع بالجمعية وتتابعون مؤشراتها وتقاريرها المجمّعة.",
    link: { href: "/register-association", label: "تسجيل جمعية" },
  },
  {
    q: "كيف يدخل ولي الأمر؟",
    a: "يرسل المعلّم من لوحته رابط دعوة خاصاً بولي الأمر، فينشئ ولي الأمر حسابه ببريده وكلمة مرور ويُربط بابنه تلقائياً — يرى تقرير ابنه قراءة فقط ولا يرى غيره.",
    link: { href: "/parent/login", label: "صفحة دخول ولي الأمر" },
  },
  {
    q: "هل بياناتنا آمنة؟",
    a: "كل مستخدم يرى ما يخص دوره فقط، وبيانات الطلاب القاصرين لا تُعرض للعامة ولا نبيعها لأحد. التفاصيل الكاملة في سياسة الخصوصية.",
    link: { href: "/privacy", label: "سياسة الخصوصية" },
  },
  {
    q: "هل يرتبط بأنظمة أخرى مثل كلاسيرا وخيركم؟",
    a: "نعم، نوفر ربطاً مع كلاسيرا وخيركم لتبادل بيانات الطلاب والتقييمات، والربط اختياري لكل جامع ويُفعّل من إعداداته.",
  },
  {
    q: "هل هو مجاني؟",
    a: "تواصل معنا ونوضّح لك كل التفاصيل.",
  },
];
