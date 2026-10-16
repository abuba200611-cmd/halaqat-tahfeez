import type { Metadata } from "next";
import { ImpersonationBannerBar } from "@/components/dev/banner-server";

/*
  مجموعة مسارات نظام إدارة الجامع (/mosque، /mosque-login). كل صفحة تبني
  هيكلها بنفسها عبر DashboardShell (سايدبار الجامع الداكن) من
  components/mosque — منفصلة تماماً عن (teacher) بلا AuthGate المعلّم، فدخول
  مدير الجامع والمشرف العام لا يمرّ بجلسة المعلّم أبداً. الشريط الأحمر
  أعلى الصفحات يظهر أثناء «عرض كـ» فقط.
*/

export const metadata: Metadata = {
  title: "إدارة الجامع — MOS",
  description: "تنظيم الحلقات والمعلّمين تحت كل جامع، وتوزيع الطلاب الجدد عليها.",
};

export default async function MosqueLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ImpersonationBannerBar />
      {children}
    </>
  );
}
