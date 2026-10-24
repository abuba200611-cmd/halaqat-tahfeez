import type { Metadata } from "next";
import { MessagesBadge } from "@/components/messages-badge";
import { StudentGate } from "@/components/student-gate";
import { BookIcon, UsersIcon, ChartIcon, ClipboardIcon, HelpIcon, HomeIcon, MessageIcon, MicIcon, SettingsIcon, StarIcon } from "@/components/icons";

/** يستبدل عنوان التبويب الموروث من الجذر لكل صفحات الطالب — اسم القسم يبقى مع وسم MOS (M5) */
export const metadata: Metadata = { title: "وردي — السلام" };

const NAV = [
  { href: "/student", label: "الرئيسية", desc: "نظرة عامة على وردك", icon: <HomeIcon size={19} /> },
  { href: "/student/log", label: "سجّل وردي", desc: "سجّل حفظك ومراجعتك اليوم", icon: <BookIcon size={19} /> },
  { href: "/student/wards", label: "أورادي", desc: "كل أورادك وحالتها", icon: <ClipboardIcon size={19} /> },
  { href: "/student/messages", label: "الرسائل", desc: "محادثاتك مع معلّمك", icon: <MessageIcon size={19} />, badge: <MessagesBadge role="student" /> },
  { href: "/student/recitations", label: "تلاواتي", desc: "سجّل تلاوتك ويقيّمها المعلّم", icon: <MicIcon size={19} /> },
  { href: "/student/monthly", label: "التقرير الشهري", desc: "أداؤك شهرياً", icon: <ChartIcon size={19} /> },
  { href: "/student/exams", label: "اختباراتي", desc: "نتائج اختبارات الحفظ", icon: <StarIcon size={19} /> },
  { href: "/student/help", label: "كيف أستخدم المنصة؟", desc: "دليل مهامك خطوة بخطوة", icon: <HelpIcon size={19} /> },
  { href: "/student/suggest", label: "اقتراح / بلاغ", desc: "شاركنا رأيك أو بلاغك", icon: <MessageIcon size={19} /> },
  // الإعدادات آخر عنصر دائماً — منطق إدراج «زملائي» بالبوابة يعتمد على ذلك
  { href: "/student/settings", label: "الإعدادات", desc: "التذكير اليومي وحسابك", icon: <SettingsIcon size={19} /> },
];

const CLASSMATES_ITEM = { href: "/student/classmates", label: "زملائي في الحلقة", desc: "أسماء طلاب حلقتك", icon: <UsersIcon size={19} /> };

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <StudentGate nav={NAV} classmatesItem={CLASSMATES_ITEM}>{children}</StudentGate>;
}
