import { AuthGate } from "@/components/auth-gate";
import { NewWardBadge } from "@/components/new-ward-badge";

const NAV = [
  { href: "/", label: "لوحة الحلقة" },
  { href: "/students", label: "الطلاب" },
  { href: "/pairing", label: "المطابقة" },
  { href: "/schedule", label: "جدول الشهر" },
  { href: "/reports", label: "تقرير الحلقة" },
  { href: "/inbox", label: "الوارد", badge: <NewWardBadge /> },
  { href: "/suggest", label: "اقتراح / بلاغ" },
];

export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate nav={NAV}>{children}</AuthGate>;
}
