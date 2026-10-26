import { AuthGate, type NavItem } from "@/components/auth-gate";
import type { NavGroup } from "@/lib/nav-groups";
import { MessagesBadge } from "@/components/messages-badge";
import { NewWardBadge } from "@/components/new-ward-badge";
import { PendingRecitationsBadge } from "@/components/pending-recitations-badge";
import { ImpersonationBannerBar } from "@/components/dev/banner-server";
import { ChartIcon, CalendarIcon, ClipboardIcon, HelpIcon, HomeIcon, MailIcon, MessageIcon, MicIcon, SearchIcon, SettingsIcon, ShuffleIcon, StarIcon, UsersIcon, BookIcon } from "@/components/icons";
import { currentTeacher } from "@/lib/auth";
import { getHalaqahStage } from "@/lib/halaqah-stage-db";
import { canTeacherRecord } from "@/lib/ward-policy";
import { profileFor } from "@/lib/halaqah-stage";
import type { Metadata } from "next";

/** عنوان تبويب قسم المعلّم — الاسم العربي للقسم يبقى، مع وسم MOS الموحّد (M5) */
export const metadata: Metadata = { title: "المعلم — السلام" };

const item = (href: string, label: string, desc: string, icon: React.ReactNode, badge?: React.ReactNode) => ({ href, label, desc, icon, badge });
const ic = 19;

const NAV: NavGroup<NavItem>[] = [
  {
    id: "top",
    items: [
      item("/", "لوحة الحلقة", "نظرة عامة على حلقتك اليوم", <HomeIcon size={ic} />),
      item("/inbox", "الوارد", "أوراد الطلاب الجديدة", <MailIcon size={ic} />, <NewWardBadge />),
      item("/messages", "الرسائل", "محادثات أولياء الأمور والطلاب والإدارة", <MessageIcon size={ic} />, <MessagesBadge role="teacher" />),
    ],
  },
  {
    id: "halaqah",
    title: "الحلقة",
    collapsible: true,
    items: [
      item("/students", "الطلاب", "إدارة قائمة طلاب حلقتك", <UsersIcon size={ic} />),
      item("/students/invites", "روابط الدعوة", "روابط انضمام الطلاب والمعلّمين المساعدين", <MailIcon size={ic} />),
      item("/attendance", "الحضور", "تسجيل حضور الطلاب اليومي", <ClipboardIcon size={ic} />),
      item("/recitations", "التلاوات", "الاستماع لتلاوات الطلاب وتقييمها", <MicIcon size={ic} />, <PendingRecitationsBadge />),
      item("/pairing", "المطابقة", "توليد ثنائيات التسميع", <ShuffleIcon size={ic} />),
      item("/schedule", "جدول الشهر", "اعتماد جدول التسميع الشهري", <CalendarIcon size={ic} />),
    ],
  },
  {
    id: "followup",
    title: "المتابعة والتقييم",
    collapsible: true,
    initialVisible: 3,
    items: [
      item("/plans", "الخطة الشهرية", "مستهدف الحفظ والمراجعة لكل طالب", <ChartIcon size={ic} />),
      item("/exams", "الاختبارات", "ترشيح الطلاب وتقييم جلسات الاختبار", <StarIcon size={ic} />),
      item("/discipline", "الانضباط", "سُلّم الغياب والمخالفات وكشف المتابعة الشهري", <ClipboardIcon size={ic} />),
      item("/cases", "دراسة الحالة", "متابعة الطلاب المتعثّرين", <SearchIcon size={ic} />),
      item("/visits", "زيارات المشرف", "تقارير زيارات المشرف التربوي لحلقتك", <SearchIcon size={ic} />),
    ],
  },
  {
    id: "reports",
    title: "التقارير",
    collapsible: true,
    items: [item("/reports", "تقرير الحلقة", "أداء الحلقة الشهري", <ChartIcon size={ic} />)],
  },
  {
    id: "bottom",
    pinned: true,
    items: [
      item("/settings", "الإعدادات", "إعدادات الحلقة والحساب والإشعارات", <SettingsIcon size={ic} />),
      item("/help", "كيف أستخدم المنصة؟", "دليل مهامك الرئيسية خطوة بخطوة", <HelpIcon size={ic} />),
      item("/suggest", "اقتراح / بلاغ", "شاركنا رأيك أو بلاغك", <MessageIcon size={ic} />),
    ],
  },
];

/** عنصر «تسجيل الورد» (001 T027) — يُضاف فوق الوارد لحلقات الابتدائي فقط */
const RECORD_ITEM: NavItem = item(
  "/record",
  "تسجيل الورد",
  "سمِّع واعتمد أوراد طلابك واحداً بعد الآخر",
  <BookIcon size={ic} />,
);

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  // عنصر «تسجيل الورد» يظهر لحلقات الابتدائي فقط (FR-003: التسجيل عن
  // الطالب للابتدائي) — الحلقات الأخرى لا ترى الخيار أصلاً (الدستور VII)
  let nav = NAV;
  const teacher = await currentTeacher();
  if (teacher && canTeacherRecord(profileFor(await getHalaqahStage(teacher.halaqahId)))) {
    nav = nav.map((group) =>
      group.id === "top"
        ? { ...group, items: [group.items[0], RECORD_ITEM, ...group.items.slice(1)] }
        : group,
    );
  }

  // شريط «أنت تشاهد كـ» يظهر أعلى كل صفحات المعلّم أثناء العرض المنتحَل
  return (
    <>
      <ImpersonationBannerBar />
      <AuthGate nav={nav}>{children}</AuthGate>
    </>
  );
}
