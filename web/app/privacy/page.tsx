import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

export const metadata: Metadata = {
  title: "سياسة الخصوصية — السلام",
  description: "كيف تتعامل منصة السلام (MOS) مع بيانات الطلاب والمعلّمين وأولياء الأمور.",
};

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "ما البيانات التي نجمعها",
    body: [
      "الأسماء وأرقام الجوال وعناوين البريد الإلكتروني لمن يسجَّل في المنصة: المعلّمون وإداريو الجامع وأولياء الأمور والطلاب.",
      "سجلات الحضور والغياب، وسجلات الحفظ والمراجعة والتلاوات وتقييمها، ونتائج الاختبارات، والملاحظات التربوية.",
      "الرسائل المتبادلة داخل المنصة بين المعلّم وولي الأمر والطالب والإدارة.",
      "بيانات تقنية محدودة لازمة للتشغيل والأمان: سجلات الدخول، ورمز اشتراك الإشعارات إن فعّلتها.",
    ],
  },
  {
    title: "كيف نستخدمها",
    body: [
      "نستخدمها فقط لتشغيل خدمات المنصة: متابعة الحلقات، ومطابقة الطلاب للتسميع، وإبلاغ أولياء الأمور، وإرسال الإشعارات التي طلبتها.",
      "لا نستخدم بيانات الطلاب للإعلانات ولا للتحليل التسويقي.",
    ],
  },
  {
    title: "لا نبيع بياناتك",
    body: [
      "لا نبيع بياناتك الشخصية ولا نؤجّرها ولا نشاركها مع أطراف إعلانية. تُشارَك البيانات فقط مع مزوّدي الاستضافة والتشغيل اللازمين لتقديم الخدمة، وبالقدر الضروري لذلك.",
    ],
  },
  {
    title: "من يرى البيانات",
    body: [
      "كل مستخدم يرى ما يخصّ دوره فقط: المعلّم يرى طلاب حلقته، وولي الأمر يرى أبناءه، والطالب يرى ورده، ومدير الجامع يرى جامعه.",
    ],
  },
  {
    title: "حماية بيانات الأطفال",
    body: [
      "معظم الطلاب قاصرون، ولذلك لا نعرض بياناتهم للعامة، ويُدار حسابهم عبر المعلّم أو ولي الأمر أو إدارة الجامع.",
    ],
  },
  {
    title: "حقوقك",
    body: [
      "يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها. للطلب، تواصل معنا من داخل المنصة أو عبر إدارة جامعك.",
    ],
  },
  {
    title: "التواصل",
    body: ["للاستفسار عن هذه السياسة أو أي طلب يخص بياناتك، تواصل معنا عبر المنصة (قسم «اقتراح / بلاغ» بعد تسجيل الدخول) أو عبر مدير جامعك."],
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
      <div className="mb-6 rounded-2xl border border-destructive/40 bg-destructive-soft p-4 text-sm font-semibold text-destructive">
        مسودة للمراجعة — هذا النص مسودة أولية ولم يعتمده المالك بعد، ويجب مراجعته قبل النشر في المتاجر.
      </div>

      <Link href="/" className="inline-flex items-center gap-2.5">
        <Image src="/brand/logo.png" alt="شعار السلام" width={36} height={39} />
        <span className="font-display text-2xl leading-none text-foreground">السلام</span>
      </Link>

      <h1 className="mt-8 text-3xl font-bold text-foreground">سياسة الخصوصية</h1>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        منصة «السلام — نظام تشغيل الجامع (MOS)» تهتم بخصوصية طلابها ومعلّميها وأولياء أمورهم. توضّح هذه الصفحة ما نجمعه وكيف نحميه.
      </p>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="text-lg font-bold text-foreground">{s.title}</h2>
            <ul className="mt-3 list-disc space-y-2 pr-5 text-sm leading-7 text-foreground/90">
              {s.body.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
