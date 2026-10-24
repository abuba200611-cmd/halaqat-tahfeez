"use client";

import { useParams } from "next/navigation";
import { MosquePage } from "@/components/mosque/mosque-page";
import { HowToSteps } from "@/components/how-to-steps";

/** دليل مدير الجامع — بناء الجامع ثم متابعته */
export default function MosqueHelpPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/help`} title="كيف أستخدم المنصة؟">
      <HowToSteps
        title="كيف أستخدم المنصة؟"
        intro="مهام مدير الجامع الرئيسية بالترتيب."
        steps={[
          {
            title: "أضف حلقات الجامع ومعلميها",
            hint: "كل حلقة لها معلّم مشرف — شاركه رابط انضمام المعلمين أو أضفه يدوياً.",
            cta: { label: "الجامع", href: `/mosque/${mosqueId}` },
          },
          {
            title: "سجّل طلاب الحلقات",
            hint: "شارك رابط تسجيل الطلاب مع معلّم كل حلقة، أو استورد قائمة كاملة من Excel.",
            cta: { label: "التسجيل", href: `/mosque/${mosqueId}/enrollment` },
          },
          {
            title: "فعّل مزايا الجامع",
            hint: "الرسوم والانضباط والاختبارات وغيرها — تشغَّل وتوقَف من الإعدادات.",
            cta: { label: "الإعدادات", href: `/mosque/${mosqueId}/settings` },
          },
          {
            title: "تابع الحضور والحفظ والتقييم",
            hint: "مؤشرات كل حلقة ومعلّميها من صفحة تقارير الجامع.",
            cta: { label: "التقارير", href: `/mosque/${mosqueId}/reports` },
          },
          {
            title: "ردّ على الرسائل",
            hint: "محادثات المعلمين وأولياء الأمور تصلك كلها في صفحة الرسائل.",
            cta: { label: "الرسائل", href: `/mosque/${mosqueId}/messages` },
          },
          {
            title: "شاركنا رأيك",
            hint: "اقتراح أو بلاغ يصل فريق المنصة مباشرة.",
            cta: { label: "اقتراح / بلاغ", href: `/mosque/${mosqueId}/suggest` },
          },
        ]}
      />
    </MosquePage>
  );
}
