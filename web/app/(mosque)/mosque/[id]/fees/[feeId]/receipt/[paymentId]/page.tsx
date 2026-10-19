"use client";

import { useParams } from "next/navigation";
import { Button, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage } from "@/components/mosque/mosque-page";
import { useApi } from "@/components/mosque/use-api";
import { ReceiptDoc } from "@/components/fees/receipt-doc";
import type { FeeStatus, PaymentMethod } from "@/lib/fees";

/* إيصال دفعة للطباعة: /mosque/[id]/fees/[feeId]/receipt/[paymentId] */

type DetailData = {
  fee: {
    studentName: string;
    halaqahName: string;
    planName: string;
    periodLabel: string;
    amountDueCents: number;
    amountPaidCents: number;
    status: FeeStatus;
  };
  payments: { id: number; amountCents: number; paidAt: string; method: PaymentMethod; receiptNo: string; note: string }[];
  mosqueName: string;
};

export default function MosqueFeeReceiptPage() {
  const params = useParams<{ id: string; feeId: string; paymentId: string }>();
  const mosqueId = Number(params.id);
  const { data, status, loading } = useApi<DetailData>(`/api/mosques/${mosqueId}/fees/${params.feeId}`);
  const payment = data?.payments.find((p) => String(p.id) === params.paymentId);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/fees`} title="إيصال دفع">
      {!data && <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الرسوم والاشتراكات" />}
      {data && !payment && <Empty title="الدفعة غير موجودة." />}
      {data && payment && (
        <div className="space-y-3">
          <div className="print:hidden">
            <Button type="button" onClick={() => window.print()}>
              طباعة
            </Button>
          </div>
          <ReceiptDoc
            data={{
              mosqueName: data.mosqueName,
              studentName: data.fee.studentName,
              halaqahName: data.fee.halaqahName,
              planName: data.fee.planName,
              periodLabel: data.fee.periodLabel,
              receiptNo: payment.receiptNo,
              paidAt: payment.paidAt,
              method: payment.method,
              amountCents: payment.amountCents,
              note: payment.note,
              amountDueCents: data.fee.amountDueCents,
              amountPaidCents: data.fee.amountPaidCents,
              status: data.fee.status,
            }}
          />
        </div>
      )}
    </MosquePage>
  );
}
