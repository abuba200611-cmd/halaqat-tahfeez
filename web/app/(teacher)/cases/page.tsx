"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { SUGGESTION_REASON_LABEL, type Suggestion } from "@/lib/case-study";
import type { CaseSummary } from "@/lib/case-db";

type CasesData = { today: string; cases: CaseSummary[]; suggestions: Suggestion[] };

const dateOnly = (iso: string) => iso.slice(0, 10);

function CaseRow({ c }: { c: CaseSummary }) {
  return (
    <li>
      <Link href={`/cases/${c.id}`} className="block">
        <Card className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted">
          <div className="min-w-0">
            <div className="truncate font-semibold">{c.studentName}</div>
            <div className="tabular text-xs text-muted-foreground">
              فُتحت {dateOnly(c.openedAt)}
              {c.closedAt ? ` · أُغلقت ${dateOnly(c.closedAt)}` : ""}
            </div>
          </div>
          <div className="tabular shrink-0 text-xs text-muted-foreground">
            {c.lastActionDate ? `آخر إجراء: ${c.lastActionDate}` : "لا إجراءات بعد"}
          </div>
        </Card>
      </Link>
    </li>
  );
}

export default function CasesPage() {
  const router = useRouter();
  const [data, setData] = useState<CasesData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [opening, setOpening] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/cases")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((d: CasesData) => {
        if (cancelled) return;
        setData(d);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const refresh = useCallback(() => setReload((n) => n + 1), []);

  async function openCase(studentId: string) {
    setOpening(studentId);
    setNotice(null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId }),
      });
      const body = (await res.json().catch(() => ({}))) as { id?: number; caseId?: number; error?: string };
      if (res.ok && body.id) {
        router.push(`/cases/${body.id}`);
        return;
      }
      setNotice(body.error ?? "تعذّر فتح الحالة");
      refresh();
    } catch {
      setNotice("تعذّر فتح الحالة");
    } finally {
      setOpening(null);
    }
  }

  const open = data?.cases.filter((c) => c.status === "open") ?? [];
  const closed = data?.cases.filter((c) => c.status === "closed") ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-naskh text-2xl font-bold">دراسة الحالة</h1>
        <p className="text-xs text-muted-foreground">خاصة بمعلّمي الحلقة فقط — لا تظهر للطلاب ولا لأولياء الأمور.</p>
      </div>

      {notice && <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">{notice}</p>}

      {failed && !data ? (
        <Empty title="تعذّر تحميل الحالات." />
      ) : !data ? (
        <Empty title="جارٍ التحميل…" />
      ) : (
        <>
          <section className="space-y-2" aria-label="الحالات المفتوحة">
            <h2 className="text-sm font-semibold">الحالات المفتوحة ({open.length})</h2>
            {open.length === 0 ? (
              <Empty title="لا حالات مفتوحة." />
            ) : (
              <ul className="space-y-2">
                {open.map((c) => (
                  <CaseRow key={c.id} c={c} />
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2" aria-label="طلاب مقترحون">
            <h2 className="text-sm font-semibold">طلاب مقترح فتح حالة لهم ({data.suggestions.length})</h2>
            {data.suggestions.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا طلاب مرشَّحون حالياً.</p>
            ) : (
              <ul className="space-y-2">
                {data.suggestions.map((s) => (
                  <li key={s.studentId}>
                    <Card className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="space-y-1">
                        <div className="font-semibold">{s.name}</div>
                        <div className="flex flex-wrap gap-1">
                          {s.reasons.map((r) => (
                            <Badge key={r} tone="warn">
                              {SUGGESTION_REASON_LABEL[r]}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <Button onClick={() => openCase(s.studentId)} disabled={opening === s.studentId}>
                        {opening === s.studentId ? "جارٍ الفتح…" : "فتح حالة"}
                      </Button>
                    </Card>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {closed.length > 0 && (
            <details className="space-y-2">
              <summary className="cursor-pointer text-sm font-semibold">الحالات المغلقة ({closed.length})</summary>
              <ul className="mt-2 space-y-2">
                {closed.map((c) => (
                  <CaseRow key={c.id} c={c} />
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
