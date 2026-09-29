import { StudentGate } from "@/components/student-gate";
import { BookIcon, ChartIcon, ClipboardIcon, HomeIcon, MessageIcon, SettingsIcon } from "@/components/icons";

const NAV = [
  { href: "/student", label: "الرئيسية", desc: "نظرة عامة على وردك", icon: <HomeIcon size={19} /> },
  { href: "/student/log", label: "سجّل وردي", desc: "سجّل حفظك ومراجعتك اليوم", icon: <BookIcon size={19} /> },
  { href: "/student/wards", label: "أورادي", desc: "كل أورادك وحالتها", icon: <ClipboardIcon size={19} /> },
  { href: "/student/monthly", label: "التقرير الشهري", desc: "أداؤك شهرياً", icon: <ChartIcon size={19} /> },
  { href: "/student/suggest", label: "اقتراح / بلاغ", desc: "شاركنا رأيك أو بلاغك", icon: <MessageIcon size={19} /> },
  { href: "/student/settings", label: "الإعدادات", desc: "التذكير اليومي وحسابك", icon: <SettingsIcon size={19} /> },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <StudentGate nav={NAV}>{children}</StudentGate>;
}
