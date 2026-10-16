"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

/*
  قسم «البلاغات»: كل اقتراحات/بلاغات كل الأدوار (معلّم، طالب، ولي أمر،
  مدير جامع) بفلترَي الدور والحالة، مع المرفقات وتغيير الحالة (مسجَّل
  بالتدقيق خادمياً). المرفقات تُعرض من مسار الأدمن القائم بمعرّفها
  العالمي — يعمل هنا لأن اللوحة كلها على مستضيج المطوّر.
*/

type Report = {
  key: string;
  source: "teacher" | "student" | "parent" | "mosque_admin";
  senderLabel: string;
  message: string;
  type: "suggestion" | "problem";
  status: "new" | "seen" | "done";
  createdAt: string;
  attachments: { id: number; sizeBytes: number }[];
};

const SOURCE_LABEL: Record<Report["source"], string> = {
  teacher: "معلّم",
  student: "طالب",
  parent: "ولي أمر",
  mosque_admin: "مدير جامع",
};

const STATUS_LABEL: Record<Report["status"], string> = { new: "جديد", seen: "مرئي", done: "منجز" };
const TYPE_LABEL: Record<Report["type"], string> = { suggestion: "اقتراح", problem: "مشكلة" };

const SOURCES = ["", "teacher", "student", "parent", "mosque_admin"] as const;
const STATUSES = ["", "new", "seen", "done"] as const;

export default function DevReportsPage() {
  const [source, setSource] = useState<(typeof SOURCES)[number]>("");
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("");
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (source) params.set("role", source);
    if (status) params.set("status", status);
    fetch(`/api/dev/reports?${params}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 401 ? "الجلسة انتهت — سجّل الدخول من جديد." : "تعذّر التحميل.");
          setReports([]);
          return;
        }
        const data = (await res.json()) as { reports?: Report[] };
        if (cancelled) return;
        setError(null);
        setReports(data.reports ?? []);
      })
      .catch(() => {
        if (!cancelled) setError("تعذّر الاتصال بالخادم.");
      });
    return () => {
      cancelled = true;
    };
  }, [source, status, tick]);

  async function changeStatus(report: Report, next: Report["status"]) {
    setBusyKey(report.key);
    setError(null);
    try {
      const res = await fetch("/api/dev/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: report.key, status: next }),
      });
      if (!res.ok) {
        setError((((await res.json().catch(() => ({})))) as { error?: string }).error ?? "تعذّر التحديث");
        return;
      }
      setTick((t) => t + 1);
    } finally {
      setBusyKey(null);
    }
  }

  const newCount = reports?.filter((r) => r.status === "new").length ?? 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-naskh text-2xl font-bold">البلاغات</h1>
        <p className="text-sm text-muted-foreground">
          اقتراحات وبلاغات كل الأدوار — {reports === null ? "…" : `${reports.length} بلاغ`} · {newCount} جديد
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {SOURCES.map((value) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => setSource(value)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors duration-200 ${
                source === value ? "bg-primary font-semibold text-on-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value ? SOURCE_LABEL[value] : "كل الأدوار"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {STATUSES.map((value) => (
            <button
              key={value || "all"}
              type="button"
              onClick={() => setStatus(value)}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-xs transition-colors duration-200 ${
                status === value ? "bg-primary font-semibold text-on-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {value ? STATUS_LABEL[value] : "كل الحالات"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {reports !== null && reports.length === 0 && !error && (
        <Card className="p-4 text-sm text-muted-foreground">لا بلاغات بهذه الفلاتر.</Card>
      )}

      {reports?.map((report) => (
        <Card key={report.key} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-semibold">{report.senderLabel}</span>
              <Badge tone={report.source === "teacher" ? "good" : undefined}>{SOURCE_LABEL[report.source]}</Badge>
              <Badge tone={report.type === "problem" ? "warn" : undefined}>{TYPE_LABEL[report.type]}</Badge>
              <Badge tone={report.status === "new" ? "warn" : report.status === "done" ? "good" : undefined}>
                {STATUS_LABEL[report.status]}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="tabular text-xs text-muted-foreground" dir="ltr">
                {report.createdAt.slice(0, 16).replace("T", " ")}
              </span>
              {(["new", "seen", "done"] as const)
                .filter((s) => s !== report.status)
                .map((s) => (
                  <Button
                    key={s}
                    variant="ghost"
                    disabled={busyKey === report.key}
                    onClick={() => changeStatus(report, s)}
                    className="text-xs"
                  >
                    → {STATUS_LABEL[s]}
                  </Button>
                ))}
            </div>
          </div>

          <p className="mt-2 whitespace-pre-wrap text-sm">{report.message}</p>

          {report.attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {report.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={`/api/admin/suggestions/attachments/${attachment.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="block h-20 w-20 overflow-hidden rounded-md border border-border"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- مرفق إداري خلف جلسة الأدمن، لا يدعمه next/image */}
                  <img
                    src={`/api/admin/suggestions/attachments/${attachment.id}`}
                    alt="مرفق"
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
