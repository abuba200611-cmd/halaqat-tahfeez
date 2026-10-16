"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage } from "@/components/mosque/mosque-page";
import { useApi, callApi } from "@/components/mosque/use-api";
import { hijriMonthOfISO, monthLabel, shiftMonthKey } from "@/lib/hijri";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/*
  A2 — كشوف المتابعة الشهرية لإدارة الجامع: كل حلقات الجامع لشهر بحالة
  تسليمها (مسوّدة/مُسلَّمة/مراجَعة)، مع مراجعة الكشف أو فتحه لتعديل المعلّم.
*/

type MosqueSheetRow = {
  halaqahId: number;
  halaqahName: string;
  supervisorName: string | null;
  studentsCount: number;
  status: "draft" | "submitted" | "reviewed";
  notes: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
};

type SheetsResponse = { month: string; sheets: MosqueSheetRow[] };

const STATUS_LABEL: Record<MosqueSheetRow["status"], string> = {
  draft: "مسوّدة",
  submitted: "مُسلَّم",
  reviewed: "مراجَع",
};
const STATUS_TONE: Record<MosqueSheetRow["status"], "neutral" | "good" | "warn"> = {
  draft: "neutral",
  submitted: "warn",
  reviewed: "good",
};

export default function MosqueSheetsPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const [month, setMonth] = useState(() => hijriMonthOfISO(riyadhTodayISO()));

  const fetcher = useCallback(
    async (m: string) => {
      const res = await fetch(`/api/mosques/${mosqueId}/discipline/sheets?month=${encodeURIComponent(m)}`).catch(
        () => null,
      );
      if (!res || !res.ok) return null;
      return (await res.json()) as SheetsResponse;
    },
    [mosqueId],
  );

  const [data, setData] = useState<SheetsResponse | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    async (m: string) => {
      setLoading(true);
      const d = await fetcher(m);
      setData(d);
      setStatus(d ? 200 : 0);
      setLoading(false);
    },
    [fetcher],
  );

  useEffect(() => {
    reload(month);
  }, [reload, month]);

  async function setSheet(row: MosqueSheetRow, action: "review" | "reopen") {
    setBusyKey(row.halaqahId);
    setError(null);
    const res = await callApi(`/api/mosques/${mosqueId}/discipline/sheets`, "PATCH", {
      halaqahId: row.halaqahId,
      month,
      action,
    });
    setBusyKey(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    reload(month);
  }

  const label = monthLabel(month);
  const prev = shiftMonthKey(month, -1);
  const next = shiftMonthKey(month, 1);
  const submitted = data?.sheets.filter((s) => s.status === "submitted").length ?? 0;
  const reviewed = data?.sheets.filter((s) => s.status === "reviewed").length ?? 0;

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/discipline/sheets`} title="كشوف المتابعة الشهرية">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => prev && setMonth(prev)} disabled={!prev} aria-label="الشهر السابق">
              ←
            </Button>
            <span className="min-w-36 text-center text-sm font-semibold">{label}</span>
            <Button variant="ghost" onClick={() => next && setMonth(next)} disabled={!next} aria-label="الشهر التالي">
              →
            </Button>
          </div>
          {data && (
            <p className="text-xs text-muted-foreground">
              {submitted} مُسلَّماً · {reviewed} مراجَعاً من {data.sheets.length} حلقة
            </p>
          )}
        </div>

        <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الانضباط والمتابعة" />
        {error && <p className="text-sm text-destructive">{error}</p>}

        {data && data.sheets.length === 0 && <Empty title="لا حلقات مرتبطة بالجامع بعد." />}
        {data && data.sheets.length > 0 && (
          <ul className="space-y-2">
            {data.sheets.map((row) => (
              <li key={row.halaqahId}>
                <Card className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{row.halaqahName}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.supervisorName ?? "بلا مشرف مسجَّل"} · {row.studentsCount} طالباً
                        {row.submittedAt && ` · سُلِّم ${row.submittedAt.slice(0, 10)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Badge>
                      {row.status === "submitted" && (
                        <Button disabled={busyKey === row.halaqahId} onClick={() => setSheet(row, "review")}>
                          اعتماد المراجعة
                        </Button>
                      )}
                      {row.status !== "draft" && (
                        <Button variant="ghost" disabled={busyKey === row.halaqahId} onClick={() => setSheet(row, "reopen")}>
                          فتح للتعديل
                        </Button>
                      )}
                    </div>
                  </div>
                  {row.notes && <p className="text-sm text-muted-foreground">ملاحظات المعلّم: {row.notes}</p>}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </MosquePage>
  );
}
