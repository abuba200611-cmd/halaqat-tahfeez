import type { Metadata } from "next";

/*
  مجموعة مسارات نظام إدارة الجامع (/mosque، /mosque-login). كل صفحة تبني
  هيكلها بنفسها عبر DashboardShell (سايدبار الجامع الداكن) من
  components/mosque — منفصلة تماماً عن (teacher) بلا AuthGate المعلّم، فدخول
  مدير الجامع والمشرف العام لا يمرّ بجلسة المعلّم أبداً.
*/
export const metadata: Metadata = {
  title: "إدارة الجامع",
  description: "تنظيم الحلقات والمعلّمين تحت كل جامع، وتوزيع الطلاب الجدد عليها.",
};

export default function MosqueLayout({ children }: { children: React.ReactNode }) {
  return children;
}
