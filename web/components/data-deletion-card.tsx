"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/*
  بطاقة «طلب حذف بياناتي» + رابط سياسة الخصوصية — تُوضع في صفحة إعدادات كل دور.
  الطلب يصل المطوّر في /dev/data-requests ويُنفَّذ بعد مراجعته؛ لا حذف فوري.
  بطاقة مستقلة التصميم (حدّ وخلفية سطحية بمتغيرات النظام) لتعمل في كل القوالب.
*/

type Kind = "teacher" | "parent" | "student" | "mosque_admin" | "association_admin";

export function DataDeletionCard({ kind }: { kind: Kind }) {
  const [pending, setPending] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/data-deletion?kind=${kind}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { pending?: boolean } | null) => {
        if (!cancelled && d) setPending(Boolean(d.pending));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/data-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر رفع الطلب");
        return;
      }
      setPending(true);
      setOpen(false);
      setMessage("وصل طلبك وسيُراجَع. سنتواصل معك عند تنفيذ الحذف.");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-surface p-4 text-sm text-foreground">
      <h2 className="text-sm font-semibold">بياناتي وخصوصيتي</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        لك حق الاطلاع على بياناتك وتصحيحها وحذفها وسحب موافقتك، كما تشرحه{" "}
        <Link href="/privacy" className="font-semibold text-accent-ink underline">
          سياسة الخصوصية
        </Link>
        .
      </p>
      {pending ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed">طلب حذف بياناتك قيد المراجعة.</p>
      ) : open ? (
        <div className="space-y-2">
          <label className="block text-xs">
            <span className="text-muted-foreground">ملاحظة (اختياري)</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
            />
          </label>
          <p className="text-xs leading-relaxed text-muted-foreground">
            سيُراجَع الطلب ثم تُحذف بياناتك الشخصية ويُغلق حسابك. لا يمكن التراجع بعد التنفيذ.
          </p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={submit}
              className="cursor-pointer rounded-xl border border-destructive bg-destructive-soft px-3 py-1.5 text-sm font-semibold text-destructive disabled:opacity-60"
            >
              {busy ? "لحظة…" : "تأكيد طلب الحذف"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded-xl border border-border px-3 py-1.5 text-sm"
            >
              تراجع
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="cursor-pointer rounded-xl border border-destructive bg-destructive-soft px-3 py-1.5 text-sm font-semibold text-destructive"
        >
          طلب حذف بياناتي
        </button>
      )}
      {message && <p className="text-xs leading-relaxed text-success">{message}</p>}
    </section>
  );
}
