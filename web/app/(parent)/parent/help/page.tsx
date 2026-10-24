"use client";

import Link from "next/link";
import { HowToSteps } from "@/components/how-to-steps";
import { ParentHowToCard } from "@/components/parent-how-to";
import { useParentSession } from "@/components/parent-shell";

/** دليل ولي الأمر — الدخول أول مرة ثم المتابعة اليومية */
export default function ParentHelpPage() {
  const { parent, checking } = useParentSession();

  if (checking) return <p className="text-sm text-stone-500">جارٍ التحقق…</p>;

  if (!parent) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-xl font-bold text-stone-800">كيف أستخدم المنصة؟</h1>
        <ParentHowToCard id="how-to" />
        <p className="text-sm text-stone-600">
          جاهز؟ <Link href="/parent/login" className="font-semibold text-accent-ink underline">سجّل دخولك من هنا</Link>.
        </p>
      </div>
    );
  }

  return (
    <HowToSteps
      title="كيف أستخدم المنصة؟"
      intro="متابعة ابنك لا تحتاج أكثر من دقيقة يومياً."
      steps={[
        {
          title: "اربط حسابك بابنك أول مرة",
          hint: "اطلب رمز الربط من معلّمه (أو رابط الدعوة من ابنك) ثم افتحه وأكّد الربط.",
        },
        {
          title: "تابع حفظ ابنك ومراجعته يومياً",
          hint: "من لوحتك: آخر الأوراد المعتمدة ونسبة الإتقان لكل جزء.",
          cta: { label: "لوحتي", href: "/parent" },
        },
        {
          title: "تابع نتائج اختباراته",
          hint: "درجات الاختبارات الرسمية وشهاداته فور اعتمادها.",
          cta: { label: "الاختبارات", href: "/parent/exams" },
        },
        {
          title: "فعّل الإشعارات وواتساب",
          hint: "تصلك تنبيهات اعتماد الأوراد والرسائل — من الإعدادات.",
          cta: { label: "الإعدادات", href: "/parent/settings" },
        },
        {
          title: "راسل المعلّم أو الإدارة",
          hint: "محادثات مباشرة مع معلّم ابنك من صفحة الرسائل.",
          cta: { label: "الرسائل", href: "/parent/messages" },
        },
      ]}
    />
  );
}
