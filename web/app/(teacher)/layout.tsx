import { AuthGate } from "@/components/auth-gate";
import { NewWardBadge } from "@/components/new-ward-badge";
import { ChartIcon, CalendarIcon, HomeIcon, MailIcon, MessageIcon, ShuffleIcon, UsersIcon } from "@/components/icons";

const NAV = [
  { href: "/", label: "لوحة الحلقة", desc: "نظرة عامة على حلقتك اليوم", icon: <HomeIcon size={19} /> },
  { href: "/students", label: "الطلاب", desc: "إدارة قائمة طلاب حلقتك", icon: <UsersIcon size={19} /> },
  { href: "/pairing", label: "المطابقة", desc: "توليد ثنائيات التسميع", icon: <ShuffleIcon size={19} /> },
  { href: "/schedule", label: "جدول الشهر", desc: "اعتماد جدول التسميع الشهري", icon: <CalendarIcon size={19} /> },
  { href: "/reports", label: "تقرير الحلقة", desc: "أداء الحلقة الشهري", icon: <ChartIcon size={19} /> },
  { href: "/inbox", label: "الوارد", desc: "أوراد الطلاب الجديدة", icon: <MailIcon size={19} />, badge: <NewWardBadge /> },
  { href: "/suggest", label: "اقتراح / بلاغ", desc: "شاركنا رأيك أو بلاغك", icon: <MessageIcon size={19} /> },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate nav={NAV}>{children}</AuthGate>;
}
