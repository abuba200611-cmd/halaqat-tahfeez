import type { Metadata } from "next";
import { HowToSteps } from "@/components/how-to-steps";

export const metadata: Metadata = { title: "كيف أستخدم المنصة؟ — الطالب" };

/** دليل الطالب — من أول ورد إلى متابعة التقدّم */
export default function StudentHelpPage() {
  return (
    <HowToSteps
      intro="كل ما تحتاجه كطالب: سجّل وردك يومياً وشاهد تقدّمك بنفسك."
      steps={[
        {
          title: "سجّل ورده اليومي",
          hint: "الحفظ والمراجعة اللذين سمّعتهما اليوم — يصل معلّمك فوراً.",
          cta: { label: "سجّل وردي", href: "/student/log" },
        },
        {
          title: "تابع أورادي وتقدّمي",
          hint: "كل أورادك السابقة ونسبة إتقانك لكل جزء.",
          cta: { label: "أورادي", href: "/student/wards" },
        },
        {
          title: "استمع لتلاواتي وتقييم المعلّم",
          hint: "التلاوات التي سجّلها معلّمك لك مع ملاحظاته.",
          cta: { label: "تلاواتي", href: "/student/recitations" },
        },
        {
          title: "اقرأ تقريرك الشهري",
          hint: "خلاصة حفظك ومراجعتك وحضورك كل شهر.",
          cta: { label: "التقرير الشهري", href: "/student/monthly" },
        },
        {
          title: "شارك رابط الدعوة مع ولي أمرك",
          hint: "من الصفحة الرئيسية: «شارك مع ولي أمرك» — يفتح الرابط وينشئ حسابه ويُربط بك تلقائياً.",
          cta: { label: "الرئيسية", href: "/student" },
        },
        {
          title: "واجهت مشكلة؟",
          hint: "أرسل اقتراحاً أو بلاغاً ويصل فريق المنصة مباشرة.",
          cta: { label: "اقتراح / بلاغ", href: "/student/suggest" },
        },
      ]}
    />
  );
}
