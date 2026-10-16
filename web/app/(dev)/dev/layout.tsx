import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/mosque/admin-auth";
import { DevShell } from "@/components/dev/shell";
import { ImpersonationBannerBar } from "@/components/dev/banner-server";

/*
  مجموعة مسارات لوحة المطوّر (/dev). محمية بجلسة الأدمن القائمة نفسها
  (ADMIN_SECRET — نفسها التي تفتح /admin ولوحة الجوامع): لا جلسة →
  تحويل لصفحة الدخول القائمة.
*/

export const metadata: Metadata = {
  title: "لوحة المطوّر",
  description: "إدارة الجوامع والمستخدمين والمزايا وصحة النظام من مكان واحد.",
};

export default async function DevLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdmin())) redirect("/admin");
  return (
    <>
      <ImpersonationBannerBar />
      <DevShell>{children}</DevShell>
    </>
  );
}
