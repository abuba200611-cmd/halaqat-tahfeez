"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Card, Empty, Stat } from "@/components/mosque/ui";
import { useApi } from "@/components/mosque/use-api";
import { inputClass } from "@/components/mosque/mosque-page";
import { AssociationPage } from "@/components/association/association-page";
import { AssociationLinkPanel } from "@/components/association/link-panel";
import type { AssociationTotals, MosqueKpiRow } from "@/lib/association";

/*
  A3 — لوحة الجمعية (قراءة فقط): مؤشرات كل جامع، إجمالي الجمعية، تقرير مجمّع
  بصيغة CSV، وفتح كل جامع بعرض قراءة فقط. الفترة تؤثر في الحضور والاختبارات؛
  التصاريح حالتها الراهنة لعام كل جامع الدراسي.
*/

type DashboardData = {
  association: { id: number; name: string; city: string } | null;
  period: { from: string; to: string };
  mosques: MosqueKpiRow[];
  totals: AssociationTotals;
};

function pct(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

export default function AssociationDashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const custom = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to);
  const query = custom ? `?from=${from}&to=${to}` : "";
  const { data, status, loading } = useApi<DashboardData>(`/api/association/dashboard${query}`);

  return (
    <AssociationPage title="لوحة الجمعية" activeHref="/association">
      <div className="space-y-5">
        <Card className="flex flex-wrap items-end gap-3 p-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">من</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">إلى</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
          </label>
          <p className="tabular text-xs text-muted-foreground">
            {data ? `الفترة: ${data.period.from} → ${data.period.to}` : "الافتراضي: الشهر الهجري الجاري"}
          </p>
          {data && (
            <a
              href={`/api/association/report?format=csv&from=${data.period.from}&to=${data.period.to}`}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary hover:bg-primary-hover"
            >
              تصدير CSV
            </a>
          )}
        </Card>

        {loading && !data && <Empty title="جارٍ التحميل…" />}
        {!loading && !data && <Empty title={status === 400 ? "فترة غير صالحة." : "تعذّر تحميل البيانات."} />}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="الجوامع" value={data.totals.mosques} />
              <Stat label="الحلقات" value={data.totals.halaqat} />
              <Stat label="الطلاب الفعّالون" value={data.totals.activeStudents} />
              <Stat label="نسبة الحضور" value={pct(data.totals.attendanceRate)} hint="مرجَّحة بعدد الطلاب" />
              <Stat label="نتائج الاختبارات" value={data.totals.examResults} hint={`ناجح: ${data.totals.examPassed}`} />
              <Stat label="تصاريح فعّالة" value={data.totals.permits.active} />
              <Stat label="موقوفة / مسحوبة" value={`${data.totals.permits.suspended} / ${data.totals.permits.withdrawn}`} />
              <Stat label="بانتظار التجديد" value={data.totals.permits.pendingRenewal} />
            </div>

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold">الجوامع</h2>
              {data.mosques.length === 0 ? (
                <Empty
                  title="لا جوامع مرتبطة بجمعيتك بعد — أرسل طلب «ربط جامع» من الأسفل."
                  action={
                    <Link href="/association/help" className="text-sm text-accent-ink underline">
                      كيف أستخدم المنصة؟
                    </Link>
                  }
                />
              ) : (
                data.mosques.map((m) => (
                  <Card key={m.mosqueId} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{m.name}</p>
                        {m.city && <p className="text-xs text-muted-foreground">{m.city}</p>}
                      </div>
                      <Link
                        href={`/association/mosques/${m.mosqueId}`}
                        className="rounded-xl border border-border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                      >
                        عرض (قراءة فقط)
                      </Link>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge>{m.halaqat} حلقة</Badge>
                      <Badge>{m.activeStudents} طالباً</Badge>
                      <Badge tone="good">حضور {pct(m.attendanceRate)}</Badge>
                      <Badge>
                        اختبارات {m.examResults} (ناجح {m.examPassed})
                      </Badge>
                      {m.permits ? (
                        <Badge tone={m.permits.suspended + m.permits.pendingRenewal > 0 ? "warn" : "good"}>
                          تصاريح: {m.permits.active} فعّال · {m.permits.suspended} موقوف · {m.permits.pendingRenewal} للتجديد ·{" "}
                          {m.permits.withdrawn} مسحوب
                        </Badge>
                      ) : (
                        <Badge>التصاريح غير مفعّلة</Badge>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </section>
          </>
        )}

        <AssociationLinkPanel />
      </div>
    </AssociationPage>
  );
}
