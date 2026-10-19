import { AuthGate } from "@/components/auth-gate";
import { MessagesBadge } from "@/components/messages-badge";
import { NewWardBadge } from "@/components/new-ward-badge";
import { PendingRecitationsBadge } from "@/components/pending-recitations-badge";
import { ImpersonationBannerBar } from "@/components/dev/banner-server";
import { ChartIcon, CalendarIcon, ClipboardIcon, HomeIcon, MailIcon, MessageIcon, MicIcon, SearchIcon, ShuffleIcon, StarIcon, UsersIcon } from "@/components/icons";
import type { Metadata } from "next";

/** عنوان تبويب قسم المعلّم — الاسم العربي للقسم يبقى، مع وسم MOS الموحّد (M5) */
export const metadata: Metadata = { title: "المعلم — السلام" };

const NAV = [
  { href: "/", label: "لوحة الحلقة", desc: "نظرة عامة على حلقتك اليوم", icon: <HomeIcon size={19} /> },
  { href: "/students", label: "الطلاب", desc: "إدارة قائمة طلاب حلقتك", icon: <UsersIcon size={19} /> },
  { href: "/pairing", label: "المطابقة", desc: "توليد ثنائيات التسميع", icon: <ShuffleIcon size={19} /> },
  { href: "/schedule", label: "جدول الشهر", desc: "اعتماد جدول التسميع الشهري", icon: <CalendarIcon size={19} /> },
  { href: "/reports", label: "تقرير الحلقة", desc: "أداء الحلقة الشهري", icon: <ChartIcon size={19} /> },
  { href: "/inbox", label: "الوارد", desc: "أوراد الطلاب الجديدة", icon: <MailIcon size={19} />, badge: <NewWardBadge /> },
  { href: "/messages", label: "الرسائل", desc: "محادثات أولياء الأمور والطلاب والإدارة", icon: <MessageIcon size={19} />, badge: <MessagesBadge role="teacher" /> },
  { href: "/recitations", label: "التلاوات", desc: "الاستماع لتلاوات الطلاب وتقييمها", icon: <MicIcon size={19} />, badge: <PendingRecitationsBadge /> },
  { href: "/attendance", label: "الحضور", desc: "تسجيل حضور الطلاب اليومي", icon: <ClipboardIcon size={19} /> },
  { href: "/plans", label: "الخطة الشهرية", desc: "مستهدف الحفظ والمراجعة لكل طالب", icon: <ChartIcon size={19} /> },
  { href: "/cases", label: "دراسة الحالة", desc: "متابعة الطلاب المتعثّرين", icon: <SearchIcon size={19} /> },
  { href: "/exams", label: "الاختبارات", desc: "ترشيح الطلاب وتقييم جلسات الاختبار", icon: <StarIcon size={19} /> },
  { href: "/discipline", label: "الانضباط", desc: "سُلّم الغياب والمخالفات وكشف المتابعة الشهري", icon: <ClipboardIcon size={19} /> },
  { href: "/visits", label: "زيارات المشرف", desc: "تقارير زيارات المشرف التربوي لحلقتك", icon: <SearchIcon size={19} /> },
  { href: "/suggest", label: "اقتراح / بلاغ", desc: "شاركنا رأيك أو بلاغك", icon: <MessageIcon size={19} /> },
];

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  // شريط «أنت تشاهد كـ» يظهر أعلى كل صفحات المعلّم أثناء العرض المنتحَل
  return (
    <>
      <ImpersonationBannerBar />
      <AuthGate nav={NAV}>{children}</AuthGate>
    </>
  );
}
