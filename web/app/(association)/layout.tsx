import type { Metadata } from "next";

/*
  مجموعة مسارات مستوى الجمعية (/association، /association-login). جلسة مدير
  الجمعية كوكي مستقل (lib/association-auth.ts) بصلاحية قراءة فقط لجوامع
  جمعيته — لا يمرّ بأي حارس مدير جامع أو معلّم.
*/

export const metadata: Metadata = {
  title: "لوحة الجمعية — MOS",
  description: "مؤشرات جوامع الجمعية وتقاريرها المجمّعة (قراءة فقط).",
};

export default function AssociationLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
