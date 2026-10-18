"use client";

import { Card } from "@/components/ui";
import { useApi } from "@/components/mosque/use-api";

type Overview = {
  counts: {
    mosques: number;
    halaqahs: number;
    teachersActive: number;
    studentsActive: number;
    parents: number;
    registrationsPending: number;
    wardsLast7Days: number;
  };
  dbName: string;
  dbSize: string;
  deploy: { commitSha: string | null; commitMessage: string | null };
};

export default function DevOverviewPage() {
  const { data, loading, status } = useApi<Overview>("/api/dev/overview");

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>;
  if (!data) {
    return (
      <Card className="p-4 text-sm text-destructive">
        {status === 401 ? "الجلسة انتهت — سجّل الدخول من جديد." : "تعذّر التحميل."}
      </Card>
    );
  }

  const stats: [string, number | string][] = [
    ["الجوامع", data.counts.mosques],
    ["الحلقات", data.counts.halaqahs],
    ["المعلّمون الفعّالون", data.counts.teachersActive],
    ["الطلاب الفعّالون", data.counts.studentsActive],
    ["أولياء الأمور", data.counts.parents],
    ["تسجيلات بانتظار التوزيع", data.counts.registrationsPending],
    ["أوراد آخر ٧ أيام", data.counts.wardsLast7Days],
    ["حجم القاعدة", data.dbSize],
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">نظرة عامة</h1>
        <p className="text-sm text-muted-foreground">أرقام المنصة الآن — قاعدة البيانات {data.dbName}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([label, value]) => (
          <Card key={label} className="px-4 py-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="tabular mt-1 text-2xl font-bold">{value}</div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">آخر نشر</h2>
        {data.deploy.commitSha ? (
          <p className="text-sm text-muted-foreground" dir="ltr">
            <span className="font-mono">{data.deploy.commitSha.slice(0, 10)}</span>
            {data.deploy.commitMessage ? ` — ${data.deploy.commitMessage}` : ""}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">لا يوجد معلومات نشر بهذه البيئة (ليست Vercel أو بلا متغيراتها).</p>
        )}
      </Card>
    </div>
  );
}
