import { BrandLogo } from "@/components/brand";
import { METHOD_LABELS, formatMoney, type FeeStatus, type PaymentMethod, STATUS_LABELS } from "@/lib/fees";

/*
  إيصال دفع قابل للطباعة بنفس نمط مستندات الطباعة بالنظام (ورقة فاتحة دائماً
  force-light، ترويسة بالشعار، سطور توقيع). مشترك بين إدارة الجامع وولي الأمر.
  سجل يدوي: الإيصال إثبات تسجيل لا إيصال بوابة دفع.
*/

export type ReceiptData = {
  mosqueName: string;
  studentName: string;
  halaqahName: string;
  planName: string;
  periodLabel: string;
  receiptNo: string;
  paidAt: string;
  method: PaymentMethod;
  amountCents: number;
  note: string;
  amountDueCents: number;
  amountPaidCents: number;
  status: FeeStatus;
};

export function ReceiptDoc({ data }: { data: ReceiptData }) {
  const remaining = data.status === "waived" ? 0 : Math.max(0, data.amountDueCents - data.amountPaidCents);

  return (
    <article dir="rtl" className="force-light mx-auto max-w-xl bg-white p-6 text-black print:p-0">
      <header className="mb-4 border-b-2 border-secondary pb-3 text-center">
        <div className="flex justify-center">
          <BrandLogo size={40} />
        </div>
        <p className="mt-1 text-sm font-semibold">{data.mosqueName}</p>
        <h1 className="font-display text-2xl font-bold">إيصال دفع</h1>
        <p className="tabular text-sm">رقم الإيصال: {data.receiptNo || "—"}</p>
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2 text-sm">
        <p>
          <span className="font-semibold">الطالب: </span>
          {data.studentName}
        </p>
        <p>
          <span className="font-semibold">الحلقة: </span>
          {data.halaqahName}
        </p>
        <p>
          <span className="font-semibold">الخطة: </span>
          {data.planName}
        </p>
        <p className="tabular">
          <span className="font-semibold">الفترة: </span>
          {data.periodLabel}
        </p>
        <p className="tabular">
          <span className="font-semibold">تاريخ الدفع: </span>
          {data.paidAt.slice(0, 10)}
        </p>
        <p>
          <span className="font-semibold">طريقة الدفع: </span>
          {METHOD_LABELS[data.method]}
        </p>
      </section>

      <table className="mb-4 w-full border-collapse text-sm">
        <tbody>
          <tr>
            <td className="border border-black px-2 py-1 font-semibold">المبلغ المدفوع</td>
            <td className="tabular border border-black px-2 py-1 font-bold">{formatMoney(data.amountCents)}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">إجمالي المستحق</td>
            <td className="tabular border border-black px-2 py-1">{formatMoney(data.amountDueCents)}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">إجمالي المدفوع حتى الآن</td>
            <td className="tabular border border-black px-2 py-1">{formatMoney(data.amountPaidCents)}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">المتبقي</td>
            <td className="tabular border border-black px-2 py-1">{formatMoney(remaining)}</td>
          </tr>
          <tr>
            <td className="border border-black px-2 py-1">الحالة</td>
            <td className="border border-black px-2 py-1">{STATUS_LABELS[data.status]}</td>
          </tr>
        </tbody>
      </table>

      {data.note.trim() !== "" && (
        <p className="mb-4 whitespace-pre-wrap text-sm">
          <span className="font-semibold">ملاحظة: </span>
          {data.note}
        </p>
      )}

      <footer className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p>المستلم</p>
          <p className="mt-6 border-t border-black pt-1">التوقيع</p>
        </div>
        <div>
          <p>ختم الجامع</p>
          <p className="mt-6 border-t border-black pt-1">&nbsp;</p>
        </div>
      </footer>
    </article>
  );
}
