import type { Metadata } from "next";

/** الصفحات العامة لروابط الجامع (/j/[mosqueId]) — بلا دخول، خارج هيكل المعلّم */
export const metadata: Metadata = {
  title: "إدارة الجامع",
  description: "التسجيل في حلقات الجامع وعرض جدوله الأسبوعي.",
};

export default function PublicMosqueLayout({ children }: { children: React.ReactNode }) {
  return children;
}
