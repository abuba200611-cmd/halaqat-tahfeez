"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PLAN_STATUS_STYLE } from "@/components/monthly-plan-card";
import { Button, Card, Empty } from "@/components/ui";
import type { AttendanceSummary } from "@/lib/attendance";
import type { CaseAction, CaseDetail, RecentWard } from "@/lib/case-db";
import { CASE_FIELDS, CASE_TEXT_MAX, type CaseField } from "@/lib/case-study";
import { PLAN_STATUS_LABEL, type PlanView } from "@/lib/monthly-plan";

type CaseData = {
  case: CaseDetail;
  actions: CaseAction[];
  today: string;
  context: { attendance: AttendanceSummary | null; plan: PlanView; wards: RecentWard[] };
};

const FIELD_META: Record<CaseField, { label: string; hint: string }> = {
  diagnosis: { label: "التشخيص", hint: "ما سبب التعثّر في تقديرك؟" },
  strengths: { label: "نقاط القوة", hint: "ما الذي يُجيده الطالب؟" },
  weaknesses: { label: "نقاط الضعف", hint: "أين يحتاج دعماً؟" },
  plan: { label: "الخطة العلاجية", hint: "الخطوات المقترحة للمعالجة" },
};

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const dateOnly = (iso: string) => iso.slice(0, 10);
const range = (from: number | null, to: number | null) => (from !== null && to !== null ? `${from}–${to}` : "—");

function Context({ ctx }: { ctx: CaseData["context"] }) {
  const { attendance, plan, wards } = ctx;
  const progress = plan.progress;
  return (
    <Card className="space-y-3 p-3">
      <h2 className="text-sm font-semibold">سياق الطالب</h2>
      <div className="grid gap-3 text-xs sm:grid-cols-2">
        <div className="space-y-1">
          <div className="font-semibold">الحضور (آخر ٣٠ يوماً)</div>
          {attendance && attendance.days > 0 ? (
            <div className="tabular text-muted-foreground">
              {attendance.presentPct}٪ · حاضر {attendance.present} · متأخر {attendance.late} · مستأذن {attendance.excused} · غائب {attendance.absent}
            </div>
          ) : (
            <div className="text-muted-foreground">لا بيانات حضور.</div>
          )}
        </div>
        <div className="space-y-1">
          <div className="font-semibold">الخطة الشهرية ({plan.monthLabel})</div>
          {plan.plan ? (
            <div className="tabular flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>
                الحفظ {plan.actual.hifzPages}/{plan.plan.hifzPagesTarget} · المراجعة {plan.actual.reviewPages}/{plan.plan.reviewPagesTarget}
              </span>
              {progress.status && (
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PLAN_STATUS_STYLE[progress.status]}`}>
                  {PLAN_STATUS_LABEL[progress.status]}
                </span>
              )}
            </div>
          ) : (
            <div className="text-muted-foreground">لا خطة لهذا الشهر.</div>
          )}
        </div>
      </div>
      <div className="space-y-1 text-xs">
        <div className="font-semibold">آخر الأوراد</div>
        {wards.length === 0 ? (
          <div className="text-muted-foreground">لا أوراد مسجّلة.</div>
        ) : (
          <ul className="tabular space-y-0.5 text-muted-foreground">
            {wards.map((w, i) => (
              <li key={`${w.date}-${i}`}>
                {w.date} · حفظ {range(w.hifzFrom, w.hifzTo)} · مراجعة {range(w.reviewFrom, w.reviewTo)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function Editor({ data, onChanged }: { data: CaseData; onChanged: () => void }) {
  const c = data.case;
  const [values, setValues] = useState<Record<CaseField, string>>({
    diagnosis: c.diagnosis,
    strengths: c.strengths,
    weaknesses: c.weaknesses,
    plan: c.plan,
  });
  const [saved, setSaved] = useState(values);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [actionText, setActionText] = useState("");
  const [resultText, setResultText] = useState("");
  const [actionDate, setActionDate] = useState(data.today);

  const dirty = CASE_FIELDS.some((f) => values[f] !== saved[f]);

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/cases/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "تعذّر الحفظ");
        return;
      }
      setSaved(values);
      setMessage("تم الحفظ.");
    } catch {
      setError("تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: "open" | "closed") {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/cases/${c.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "تعذّر تغيير الحالة");
        return;
      }
      onChanged();
    } catch {
      setError("تعذّر تغيير الحالة");
    } finally {
      setBusy(false);
    }
  }

  async function addAction() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/cases/${c.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actionText, result: resultText, actionDate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "تعذّر إضافة الإجراء");
        return;
      }
      setActionText("");
      setResultText("");
      onChanged();
    } catch {
      setError("تعذّر إضافة الإجراء");
    } finally {
      setBusy(false);
    }
  }

  const isOpen = c.status === "open";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">حالة {c.studentName}</h1>
          <div className="tabular text-xs text-muted-foreground">
            {isOpen ? "مفتوحة" : "مغلقة"} · فُتحت {dateOnly(c.openedAt)}
            {c.closedAt ? ` · أُغلقت ${dateOnly(c.closedAt)}` : ""}
          </div>
        </div>
        <Button variant={isOpen ? "ghost" : "primary"} disabled={busy} onClick={() => setStatus(isOpen ? "closed" : "open")}>
          {isOpen ? "إغلاق الحالة" : "إعادة فتح الحالة"}
        </Button>
      </div>

      {error && <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p>}

      <Context ctx={data.context} />

      <Card className="space-y-3 p-3">
        {CASE_FIELDS.map((f) => (
          <label key={f} className="block">
            <span className="text-sm font-semibold">{FIELD_META[f].label}</span>
            <span className="ms-2 text-xs text-muted-foreground">{FIELD_META[f].hint}</span>
            <textarea
              value={values[f]}
              maxLength={CASE_TEXT_MAX}
              rows={4}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
              className={FIELD}
            />
            <span className="tabular text-[11px] text-muted-foreground">
              {values[f].length} / {CASE_TEXT_MAX}
            </span>
          </label>
        ))}
        <div className="flex items-center justify-end gap-2">
          {dirty && <span className="text-xs text-muted-foreground">تعديلات غير محفوظة</span>}
          <Button onClick={save} disabled={busy || !dirty}>
            حفظ
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-3">
        <h2 className="text-sm font-semibold">سجلّ المتابعة</h2>
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <input
              type="date"
              value={actionDate}
              onChange={(e) => setActionDate(e.target.value)}
              aria-label="تاريخ الإجراء"
              className={`tabular ${FIELD}`}
            />
            <textarea
              value={actionText}
              maxLength={CASE_TEXT_MAX}
              rows={2}
              placeholder="الإجراء الذي تم (مثلاً: اتصال بولي الأمر)"
              onChange={(e) => setActionText(e.target.value)}
              className={FIELD}
            />
          </div>
          <textarea
            value={resultText}
            maxLength={CASE_TEXT_MAX}
            rows={2}
            placeholder="النتيجة (اختياري)"
            onChange={(e) => setResultText(e.target.value)}
            className={FIELD}
          />
          <div className="flex justify-end">
            <Button onClick={addAction} disabled={busy || actionText.trim() === "" || actionDate === ""}>
              إضافة إجراء
            </Button>
          </div>
        </div>

        {data.actions.length === 0 ? (
          <p className="text-xs text-muted-foreground">لا إجراءات مسجّلة بعد.</p>
        ) : (
          <ul className="space-y-2">
            {data.actions.map((a) => (
              <li key={a.id} className="rounded-md border border-border p-2 text-sm">
                <div className="tabular text-xs text-muted-foreground">{a.actionDate}</div>
                <div className="whitespace-pre-wrap">{a.action}</div>
                {a.result && <div className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">النتيجة: {a.result}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

export default function CasePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<CaseData | null>(null);
  const [state, setState] = useState<"loading" | "missing" | "failed" | "ready">("loading");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/cases/${encodeURIComponent(id)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setState("missing");
        if (!res.ok) return setState("failed");
        setData((await res.json()) as CaseData);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  const refresh = useCallback(() => setVersion((n) => n + 1), []);

  return (
    <div className="space-y-4">
      <Link href="/cases" className="text-xs text-muted-foreground underline">
        ‹ كل الحالات
      </Link>
      {state === "ready" && data ? (
        <Editor key={data.case.id} data={data} onChanged={refresh} />
      ) : state === "missing" ? (
        <Empty title="الحالة غير موجودة." />
      ) : state === "failed" ? (
        <Empty title="تعذّر تحميل الحالة." />
      ) : (
        <Empty title="جارٍ التحميل…" />
      )}
    </div>
  );
}
