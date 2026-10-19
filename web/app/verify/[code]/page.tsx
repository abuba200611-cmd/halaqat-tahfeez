"use client";

import { BackButton } from "@/components/back-button";
import { useEffect, useState } from "react";
import { BrandLockup } from "@/components/brand";

/*
  صفحة التحقق العامة من شهادة — /verify/[code] بلا أي جلسة. تعرض أقل ما
  يثبت صلاحيتها: نوع الشهادة والجامع واسم الحامل والإنجاز وتاريخ الإصدار
  (هجري وميلادي) وصلاحية الرمز — لا درجات ولا بيانات خاصة أخرى.
*/

type VerifyData = {
  valid: boolean;
  kind: string;
  kindLabel: string;
  mosqueName: string;
  holderName: string;
  title: string;
  issuedAt: string;
};

export default function VerifyCertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const [data, setData] = useState<VerifyData | null | "not-found" | "error">(null);

  useEffect(() => {
    let cancelled = false;
    params
      .then(({ code }) => fetch(`/api/verify/${encodeURIComponent(code)}`))
      .then(async (res) => ({ ok: res.ok, body: res.ok ? await res.json() : null }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        setData(ok ? (body as VerifyData) : "not-found");
      })
      .catch(() => {
        if (!cancelled) setData("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-stone-50 px-4 py-10">
      <div className="mb-3 w-full max-w-md">
        <BackButton />
      </div>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <BrandLockup tone="onLight" size={44} />
        <h1 className="font-display mt-2 text-xl font-bold text-foreground">التحقق من الشهادات</h1>

        {data === null && <p className="mt-6 text-sm text-stone-500">جارٍ التحقق…</p>}

        {data === "not-found" && (
          <div className="mt-6 space-y-2">
            <p className="font-naskh text-lg font-bold text-destructive">الرمز غير صحيح</p>
            <p className="text-sm text-stone-500">لا توجد شهادة بهذا الرمز — تأكد منه أو راجع إدارة الجامع.</p>
          </div>
        )}

        {data === "error" && (
          <div className="mt-6 space-y-2">
            <p className="font-naskh text-lg font-bold text-destructive">تعذّر التحقق</p>
            <p className="text-sm text-stone-500">حاول مرة أخرى بعد قليل.</p>
          </div>
        )}

        {data && data !== "not-found" && data !== "error" && (
          <div className="mt-6 space-y-4">
            <p
              className={`mx-auto w-fit rounded-full px-4 py-1.5 text-sm font-bold ${
                data.valid ? "bg-success-soft text-success" : "bg-destructive-soft text-destructive"
              }`}
            >
              {data.valid ? "✅ شهادة صحيحة وسارية" : "⛔ شهادة مسحوبة"}
            </p>
            <div className="space-y-1 rounded-xl bg-stone-50 p-4 text-stone-700">
              <p className="text-xs text-stone-500">{data.kindLabel}</p>
              <p className="font-naskh text-lg font-bold text-stone-800">{data.holderName}</p>
              <p>{data.title}</p>
              <p className="text-sm text-stone-600">جامع {data.mosqueName}</p>
              <p className="tabular text-xs text-stone-500">صدرت بتاريخ {data.issuedAt}</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
