import { AuthGate } from "@/components/auth-gate";
import { NewWardBadge } from "@/components/new-ward-badge";
import { ChartIcon, CalendarIcon, HomeIcon, MailIcon, MessageIcon, ShuffleIcon, UsersIcon } from "@/components/icons";

const NAV = [
  { href: "/", label: "لوحة الحلقة", icon: <HomeIcon size={19} /> },
  { href: "/students", label: "الطلاب", icon: <UsersIcon size={19} /> },
  { href: "/pairing", label: "المطابقة", icon: <ShuffleIcon size={19} /> },
  { href: "/schedule", label: "جدول الشهر", icon: <CalendarIcon size={19} /> },
  { href: "/reports", label: "تقرير الحلقة", icon: <ChartIcon size={19} /> },
  { href: "/inbox", label: "الوارد", icon: <MailIcon size={19} />, badge: <NewWardBadge /> },
  { href: "/suggest", label: "اقتراح / بلاغ", icon: <MessageIcon size={19} /> },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate nav={NAV}>{children}</AuthGate>;
}
