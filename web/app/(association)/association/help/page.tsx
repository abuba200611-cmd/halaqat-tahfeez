"use client";

import { AssociationPage } from "@/components/association/association-page";
import { HowToSteps } from "@/components/how-to-steps";

/** دليل مدير الجمعية — متابعة الجوامع وزيارات المشرف التربوي */
export default function AssociationHelpPage() {
  return (
    <AssociationPage title="كيف أستخدم المنصة؟" activeHref="/association/help">
      <HowToSteps
        title="كيف أستخدم المنصة؟"
        intro="مهام الجمعية الرئيسية بالترتيب."
        steps={[
          {
            title: "تابع جوامع جمعيتك",
            hint: "كل جامع منضمّ لجمعيتك بمؤشراته وحلقاته في مكان واحد.",
            cta: { label: "الجامع", href: "/association" },
          },
          {
            title: "افتح زيارة مشرف تربوي",
            hint: "زيارة موثّقة لحلقة أو جامع: ملاحظات وتقييم ونتائج.",
            cta: { label: "زيارات المشرف", href: "/association/visits" },
          },
          {
            title: "راجع تقارير الزيارات السابقة",
            hint: "سجل كامل قابل للطباعة لكل زيارة ونتائجها.",
            cta: { label: "الزيارات", href: "/association/visits" },
          },
          {
            title: "حدّث بيانات حسابك",
            hint: "اسم الجمعية وكلمة المرور من الإعدادات.",
            cta: { label: "الإعدادات", href: "/association/settings" },
          },
        ]}
      />
    </AssociationPage>
  );
}
