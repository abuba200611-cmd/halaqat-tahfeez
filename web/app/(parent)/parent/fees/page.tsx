"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParentSession } from "@/components/parent-shell";
import { METHOD_LABELS, STATUS_LABELS, formatMoney, type FeeStatus, type PaymentMethod } from "@/lib/fees";

/*
  رسوم الأبناء — قراءة فقط: المستحقات والدفعات لأبناء الولي المرتبطين (بجوامع
  فعّلت الميزة)، مع رابط إيصال للطباعة لكل دفعة. لا تسجيل ولا تعديل هنا.
*/

type Payment = { id: number; amountCents: number; paidAt: string; method: PaymentMethod; receiptNo: string };
type ChildFees = {
  halaqahId: number;
  studentId: string;
  studentName: string;
  halaqahName: string;
  mosqueName: string;
  fees: {
    id: number;
    planName: string;
    periodLabel: string;
    amountDueCents: number;
    amountPaidCents: number;
    status: FeeStatus;
    dueDate: string | null;
    payments: Payment[];
  }[];
};

const STATUS_STYLE: Record<FeeStatus, string> = {
  due: "bg-destructive-soft text-destructive",
  partial: "bg-stone-100 text-stone-700",
  paid: "bg-success-soft text-success",
  waived: "bg-stone-100 text-stone-600",
};

export default function ParentFeesPage() {
  const { parent } = useParentSession();
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

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-stone-800">الرسوم والاشتراكات</h1>
      <p className="text-xs text-stone-500">سجل المستحقات والدفعات كما سجّلته إدارة الجامع — للاطلاع فقط.</p>

      {children === null ? (
        <p className="text-sm text-stone-500">جارٍ التحميل…</p>
      ) : children.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <p className="font-naskh text-lg font-bold text-stone-700">لا رسوم لعرضها</p>
          <p className="text-sm text-stone-500">لم تفعّل إدارة الجامع الرسوم لأبنائك بعد.</p>
        </div>
      ) : (
        children.map((child) => (
          <section key={`${child.halaqahId}:${child.studentId}`} className="space-y-3">
            <h2 className="text-sm font-semibold text-stone-700">
              {child.studentName} — حلقة {child.halaqahName}
            </h2>
            {child.fees.length === 0 ? (
              <p className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-500">لا مستحقات مسجّلة.</p>
            ) : (
              child.fees.map((fee) => (
                <article key={fee.id} className="space-y-2 rounded-2xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-stone-800">{fee.planName}</p>
                      <p className="tabular text-xs text-stone-500">
                        {fee.periodLabel}
                        {fee.dueDate ? ` · الاستحقاق ${fee.dueDate}` : ""}
                      </p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[fee.status]}`}>
                      {STATUS_LABELS[fee.status]}
                    </span>
                  </div>
                  <p className="tabular text-sm text-stone-700">
                    المستحق {formatMoney(fee.amountDueCents)} · المدفوع {formatMoney(fee.amountPaidCents)}
                  </p>
                  {fee.payments.length > 0 && (
                    <ul className="space-y-1 border-t border-stone-100 pt-2 text-sm">
                      {fee.payments.map((payment) => (
                        <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="tabular text-stone-600">
                            {formatMoney(payment.amountCents)} · {METHOD_LABELS[payment.method]} · {payment.paidAt.slice(0, 10)}
                          </span>
                          <Link
                            href={`/parent/fees/receipt?halaqah=${child.halaqahId}&student=${encodeURIComponent(child.studentId)}&payment=${payment.id}`}
                            className="rounded-lg border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-600 hover:bg-stone-50"
                          >
                            إيصال
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))
            )}
          </section>
        ))
      )}
    </div>
  );
}
