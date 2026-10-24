import type { ReactNode } from "react";

/*
  بطاقة «كيف تدخل كولي أمر؟» — المسار القصير بثلاث خطوات، تظهر أعلى نموذج
  الدخول (/parent/login) وقبل إنشاء الحساب في رابط الدعوة (/parent/join)،
  وإليها يقود زر «أنا ولي أمر» بالصفحة الرئيسية (#how-to).
*/

const STEPS: { title: string; hint: ReactNode }[] = [
  { title: "اطلب رمز ابنك من معلّمه", hint: "يرسل لك المعلّم رابط دعوة عبر واتساب — رمز الربط مضمن فيه." },
  { title: "أنشئ حسابك", hint: "من نفس الرابط: بريدك وكلمة مرورك فقط، بلا موافقات ولا انتظار." },
  { title: "أدخل الرمز", hint: "افتح الرابط وأكّد الربط — يظهر ابنك في لوحتك فوراً." },
];

export function ParentHowToCard({ id }: { id?: string }) {
  return (
    <section
      id={id}
      aria-labelledby="parent-how-to-title"
      className="rounded-2xl border border-accent/30 bg-accent-soft p-5"
    >
      <h2 id="parent-how-to-title" className="text-sm font-bold text-accent-ink">
        كيف تدخل كولي أمر؟
      </h2>
      <ol className="mt-3 space-y-2.5">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex items-start gap-2.5">
            <span className="tabular mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-on-secondary">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{step.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.hint}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
