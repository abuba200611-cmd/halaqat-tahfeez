import type { Metadata } from "next";
import { Noto_Sans_Arabic, Noto_Naskh_Arabic } from "next/font/google";
import "./globals.css";

const sans = Noto_Sans_Arabic({
  variable: "--font-arabic-sans",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

const naskh = Noto_Naskh_Arabic({
  variable: "--font-arabic-naskh",
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "المعلم — إدارة التحفيظ والمطابقة",
  description: "تسجيل الحفظ، ومطابقة الطلاب للتسميع المتبادل، وتوليد جدول المراجعة.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${sans.variable} ${naskh.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
