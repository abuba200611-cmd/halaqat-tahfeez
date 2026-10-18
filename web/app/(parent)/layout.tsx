import type { Metadata } from "next";
import { ParentShell } from "@/components/parent-shell";

/** يستبدل عنوان التبويب الموروث من الجذر لكل صفحات ولي الأمر — اسم القسم يبقى مع وسم MOS (M5) */
export const metadata: Metadata = { title: "متابعة الأبناء — السلام" };

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return <ParentShell>{children}</ParentShell>;
}
