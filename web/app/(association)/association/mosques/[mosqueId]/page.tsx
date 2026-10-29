"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Card, Empty } from "@/components/mosque/ui";
import { useApi } from "@/components/mosque/use-api";
import { AssociationPage } from "@/components/association/association-page";
import { MosqueChartsSection } from "@/components/mosque/mosque-charts";
import { Donut, Panel, TONES } from "@/components/charts";
import { safePct } from "@/lib/chart-series";
import { PERMIT_STATUS_LABELS, type PermitStatus } from "@/lib/permits";
import type { MosqueCharts } from "@/lib/dashboard-charts-db";
import type { MosqueHalaqahRow } from "@/lib/association-db";
import type { ExamStats } from "@/lib/mosque/exams-db";

/*
  A3 — عرض جامع من لوحة الجمعية، قراءة فقط: رسومه أولاً ثم حلقاته وحضورها،
  وأقسام الاختبارات والتصاريح إن كانت مفعّلة له. لا نماذج ولا أزرار تعديل
  هنا، والمسار نفسه يردّ 404 لجامع ليس من جمعية الجلسة. رسوم الجامع
  (مواصفة 003) نفسها هنا بمصدر بيانات الجمعية.
*/

type MosqueView = {
  mosque: { id: number; name: string; city: string };
  period: { from: string; to: string };
  features: { exams: boolean; permits: boolean };
  halaqat: MosqueHalaqahRow[];
  exams: ExamStats | null;
  charts?: MosqueCharts;
  permits: {
    academicYear: number;
    halaqat: {
      halaqahId: number;
      name: string;
      activeStudents: number;
      status: PermitStatus | null;
      renewalDue: string | null;
      suspensionsCount: number;
    }[];
  } | null;
};

export default function AssociationMosquePage() {
  const params = useParams<{ mosqueId: string }>();
  const { data, status, loading } = useApi<MosqueView>(`/api/association/mosques/${params.mosqueId}`);

  return (
    <AssociationPage title={data?.mosque.name ?? "جامع"} activeHref="/association">
      <div className="space-y-5">
        <Link href="/association" className="text-sm text-accent-ink hover:underline">
          ← لوحة الجمعية
        </Link>
        {loading && <Empty title="جارٍ التحميل…" />}
        {!loading && !data && <Empty title={status === 404 ? "الجامع غير موجود." : "تعذّر تحميل البيانات."} />}
        {data && (
          <>
            <p className="tabular text-xs text-muted-foreground">
              {data.mosque.city ? `${data.mosque.city} · ` : ""}الفترة: {data.period.from} → {data.period.to}
            </p>

            {data.charts && <MosqueChartsSection charts={data.charts} />}

            <section className="space-y-2">
              <h2 className="font-display text-lg font-bold">الحلقات</h2>
              {data.halaqat.length === 0 ? (
                <Empty title="لا حلقات." />
              ) : (
                data.halaqat.map((h) => (
                  <Card key={h.halaqahId} className="flex flex-wrap items-center justify-between gap-2 p-4">
                    <div>
                      <p className="font-semibold">{h.name}</p>
                      {h.teacherNames && <p className="text-xs text-muted-foreground">{h.teacherNames}</p>}
                    </div>
                    <div className="flex gap-2 text-xs">
                      <Badge>{h.activeStudents} طالباً</Badge>
                      <Badge tone="good">حضور {h.attendanceRate === null ? "—" : `${h.attendanceRate}%`}</Badge>
                    </div>
                  </Card>
                ))
              )}
            </section>

            {data.exams && (
              <section className="space-y-2">
                <h2 className="font-display text-lg font-bold">الاختبارات</h2>
                <ExamResultsChart totals={data.exams.totals} />
                {data.exams.byHalaqah.map((h) => (
                  <Card key={h.halaqahId} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <span>{h.name}</span>
                    <span className="tabular text-xs text-muted-foreground">
                      {h.passed} ناجح من {h.results}
                    </span>
                  </Card>
                ))}
              </section>
            )}

            {data.permits && (
              <section className="space-y-2">
                <h2 className="font-display text-lg font-bold">
                  التصاريح <span className="tabular text-xs font-normal text-muted-foreground">({data.permits.academicYear} هـ)</span>
                </h2>
                {data.permits.halaqat.map((h) => (
                  <Card key={h.halaqahId} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <span>{h.name}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {h.renewalDue ? `التجديد: ${h.renewalDue}` : ""}
                      <Badge tone={h.status === "active" ? "good" : h.status ? "warn" : "neutral"}>
                        {h.status ? PERMIT_STATUS_LABELS[h.status] : "بلا تصريح"}
                      </Badge>
                    </span>
                  </Card>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </AssociationPage>
  );
}

/** نتيجة اختبارات الجامع بالفترة — دونات ناجح/غير ناجح من أرقام المسار نفسها */
function ExamResultsChart({ totals }: { totals: ExamStats["totals"] }) {
  const failed = Math.max(totals.results - totals.passed, 0);
  return (
    <Panel title="نتائج الاختبارات (خلال الفترة)">
      <Donut
        total={totals.results}
        centerLabel="نتيجة"
        ariaLabel={`نتائج الاختبارات خلال الفترة: ناجح ${totals.passed}، غير ناجح ${failed}`}
        slices={[
          { label: "ناجح", value: totals.passed, pct: safePct(totals.passed, totals.results), tone: TONES.success },
          { label: "غير ناجح", value: failed, pct: safePct(failed, totals.results), tone: TONES.accent45 },
        ]}
      />
    </Panel>
  );
}
