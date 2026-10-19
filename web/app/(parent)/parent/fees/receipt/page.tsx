"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useParentSession } from "@/components/parent-shell";
import { ReceiptDoc, type ReceiptData } from "@/components/fees/receipt-doc";
import type { FeeStatus, PaymentMethod } from "@/lib/fees";

/*
  إيصال دفعة لولي الأمر للطباعة: يُبنى من /api/parent/fees نفسه (أبناء الولي
  المرتبطون فقط)، فلا معرّف من الرابط يصل لبيانات غير أبنائه — الرابط يحدّد
  أي دفعة تُعرض من بين دفعاته فحسب.
*/

type ChildFees = {
  halaqahId: number;
  studentId: string;
  studentName: string;
  halaqahName: string;
  mosqueName: string;
  fees: {
    planName: string;
    periodLabel: string;
    amountDueCents: number;
    amountPaidCents: number;
    status: FeeStatus;
    payments: { id: number; amountCents: number; paidAt: string; method: PaymentMethod; receiptNo: string; note: string }[];
  }[];
};

export default function ParentReceiptPage() {
  return (
    <Suspense>
      <Receipt />
    </Suspense>
  );
}

function Receipt() {
  const { parent } = useParentSession();
  const params = useSearchParams();
  const parentId = parent?.id ?? null;
  const [children, setChildren] = useState<ChildFees[] | null>(null);

  useEffect(() => {
    if (parentId === null) return;
    let cancelled = false;
    fetch("/api/parent/fees")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { children?: ChildFees[] } | null) => {
        if (!cancelled) setChildren(data?.children ?? []);
      })
      .catch(() => {
        if (!cancelled) setChildren([]);
      });
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  if (children === null) return <p className="text-sm text-stone-500">جارٍ التحميل…</p>;

  const halaqah = params.get("halaqah");
  const student = params.get("student");
  const paymentId = params.get("payment");
  let data: ReceiptData | null = null;
  for (const child of children) {
    if (String(child.halaqahId) !== halaqah || child.studentId !== student) continue;
    for (const fee of child.fees) {
      const payment = fee.payments.find((p) => String(p.id) === paymentId);
      if (!payment) continue;
      data = {
        mosqueName: child.mosqueName,
        studentName: child.studentName,
        halaqahName: child.halaqahName,
        planName: fee.planName,
        periodLabel: fee.periodLabel,
        receiptNo: payment.receiptNo,
        paidAt: payment.paidAt,
        method: payment.method,
        amountCents: payment.amountCents,
        note: payment.note,
        amountDueCents: fee.amountDueCents,
        amountPaidCents: fee.amountPaidCents,
        status: fee.status,
      };
    }
  }

  if (!data) return <p className="text-sm text-stone-500">الإيصال غير موجود.</p>;

  return (
    <div className="space-y-3">
      <div className="print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="cursor-pointer rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
        >
          طباعة
        </button>
      </div>
      <ReceiptDoc data={data} />
    </div>
  );
}
