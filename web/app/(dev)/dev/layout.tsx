import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/mosque/admin-auth";
import { DEV_APP_SHORT_NAME } from "@/lib/pwa";
import { DevShell } from "@/components/dev/shell";
import { ImpersonationBannerBar } from "@/components/dev/banner-server";

/*
  مجموعة مسارات لوحة المطوّر (/dev). محمية بجلسة الأدمن القائمة نفسها
  (ADMIN_SECRET — نفسها التي تفتح /admin ولوحة الجوامع): لا جلسة →
  تحويل لصفحة الدخول القائمة.
*/

export const metadata: Metadata = {
  title: "لوحة المطوّر — السلام",
  description: "إدارة الجوامع والمستخدمين والمزايا وصحة النظام من مكان واحد.",
  applicationName: DEV_APP_SHORT_NAME,
  appleWebApp: { capable: true, title: DEV_APP_SHORT_NAME, statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/brand/icons/dev-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icons/dev-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/icons/dev-apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
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
