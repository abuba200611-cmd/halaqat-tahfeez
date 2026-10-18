import type { Metadata } from "next";
import { Noto_Naskh_Arabic, Noto_Sans_Arabic } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

/* خط العلامة — KOMission Black (900): اسم «السلام» والعناوين فقط */
const display = localFont({
  src: "../public/brand/KOMission-Black.otf",
  weight: "900",
  display: "swap",
  variable: "--font-display",
  fallback: ["Noto Sans Arabic"],
});

/* خط المتن — Noto Sans Arabic مقروء على كل الأحجام */
const body = Noto_Sans_Arabic({
  variable: "--font-body",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

const naskh = Noto_Naskh_Arabic({
  variable: "--font-arabic-naskh",
  subsets: ["arabic"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "السلام — MOS نظام تشغيل الجامع",
  description: "تسجيل الحفظ، ومطابقة الطلاب للتسميع، وتوليد جدول المراجعة.",
  icons: {
    icon: [
      { url: "/brand/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/brand/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${display.variable} ${body.variable} ${naskh.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
