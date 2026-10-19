"use client";

/*
  A2 — مستندات الانضباط القابلة للطباعة (إنذار/تعهد/استدعاء ولي الأمر):
  A4 بالعربية RTL بترويسة الجامع وخانات توقيع. مكوّن عرض خالص يشاركه
  مسار المعلّم ومسار إدارة الجامع — بناء النص هنا والبيانات من المستدعي.
*/

import type { DisciplineDocKind } from "@/lib/discipline";
import { BrandLogo } from "./brand";

export type DisciplineDocData = {
  mosqueName: string;
  halaqahName: string;
  studentName: string;
  docKind: DisciplineDocKind;
  /** تاريخ الحدث المولِّد للمستند (YYYY-MM-DD) */
  eventDate: string;
  /** سبب الحدث كما سجّله النظام/المعلّم */
  reason: string;
};

const DOC_TITLE: Record<DisciplineDocKind, string> = {
  warning: "خطاب إنذار",
  pledge: "تعهد",
  summons: "خطاب استدعاء ولي أمر",
};

/** نص المستند حسب نوعه — فقرات جاهزة للطباعة الرسمية */
export function buildDocBody(doc: DisciplineDocData): string[] {
  const header = `المكرم ولي أمر الطالب/ ${doc.studentName} — حلقة ${doc.halaqahName}`;
  switch (doc.docKind) {
    case "warning":
      return [
        header,
        "السلام عليكم ورحمة الله وبركاته،",
        `نحيط علمكم بأن ابنكم تجاوز الحدّ المقرر بنظام الانضباط في جامعكم (${doc.mosqueName})، وذلك بسبب: ${doc.reason}.`,
        "عليه فقد صدر بحقه هذا الإنذار، ونأمل متابعة حضوره والتواصل مع معلّم الحلقة لتفادي الإجراءات التالية في سُلّم الانضباط.",
        "وتفضلوا بقبول فائق الاحترام والتقدير،",
      ];
    case "pledge":
      return [
        header,
        "أتعهد أنا ولي أمر الطالب المذكور بما يلي:",
        "١. متابعة حضور ابني الانتظامي للحلقة وعدم تغيّبه إلا لعذر مقبول يُبلَّغ عنه المعلّم.",
        "٢. المتابعة اليومية لورد الحفظ والمراجعة وفق خطة الحلقة.",
        "٣. التواصل مع معلّم الحلقة فور أي استدعاء أو ملاحظة.",
        `وقد باشر سبب هذا التعهد: ${doc.reason}.`,
        "وأتحمل مسؤولية الالتزام بهذا التعهد، علمًا بأن مخالفته تستوجب استكمال إجراءات سُلّم الانضباط.",
      ];
    case "summons":
      return [
        header,
        "السلام عليكم ورحمة الله وبركاته،",
        `نستدعي سيادتكم للحضور إلى جامع (${doc.mosqueName}) للقاء معلّم الحلقة والإدارة، بسبب: ${doc.reason}.`,
        "ويُرجى الحضور خلال ثلاثة أيام عمل من تاريخ هذا الخطاب لبحث الحالة وتوقيع التعهد اللازم.",
        "وتفضلوا بقبول فائق الاحترام والتقدير،",
      ];
  }
}

const SIGNATURES: Record<DisciplineDocKind, string[]> = {
  warning: ["معلّم الحلقة", "ولي الأمر", "إدارة الجامع"],
  pledge: ["ولي الأمر", "معلّم الحلقة", "إدارة الجامع"],
  summons: ["معلّم الحلقة", "إدارة الجامع"],
};

/** صفحة المستند — تُطبع بـ window.print() وزر الطباعة يختفي منها */
export function DisciplineDoc({ doc }: { doc: DisciplineDocData }) {
  const body = buildDocBody(doc);
  const signatures = SIGNATURES[doc.docKind];
  return (
    <div className="discipline-doc force-light mx-auto max-w-[210mm] bg-white p-10 text-stone-900 shadow-sm print:max-w-none print:p-0 print:shadow-none">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 15mm; }
          body { background: white !important; }
          .discipline-doc-print-hidden { display: none !important; }
        }
      `}</style>

      {/* ترويسة الجامع */}
      <header className="border-b-2 border-secondary pb-3 text-center">
        <div className="flex justify-center">
          <BrandLogo size={40} />
        </div>
        <p className="font-naskh mt-2 text-xl font-bold">بسم الله الرحمن الرحيم</p>
        <p className="mt-2 text-lg font-bold">جامع {doc.mosqueName}</p>
        <p className="text-sm text-stone-600">السلام — MOS نظام تشغيل الجامع | الانضباط والمتابعة</p>
      </header>

      <div className="mt-4 flex items-start justify-between text-sm">
        <p>التاريخ: {doc.eventDate}</p>
        <p className="font-semibold">الرقم: د-{doc.docKind === "warning" ? "ن" : doc.docKind === "pledge" ? "ت" : "س"}</p>
      </div>

      <h1 className="font-display mt-6 text-center text-2xl font-bold underline">{DOC_TITLE[doc.docKind]}</h1>

      <div className="mt-6 space-y-4 text-justify font-naskh text-lg leading-9">
        {body.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {/* خانات التوقيع */}
      <div className="mt-14 grid grid-cols-3 gap-6 text-center text-sm">
        {signatures.map((role) => (
          <div key={role}>
            <p className="font-semibold">{role}</p>
            <div className="mt-10 border-t border-dashed border-stone-500 pt-1 text-xs text-stone-500">الاسم والتوقيع</div>
          </div>
        ))}
      </div>

      <footer className="mt-10 border-t border-stone-300 pt-2 text-center text-xs text-stone-500">
        حلقة {doc.halaqahName} — صدر هذا المستند من نظام تشغيل الجامع (MOS)
      </footer>
    </div>
  );
}
