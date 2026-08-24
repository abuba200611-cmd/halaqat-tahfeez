"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

const COPY = {
  suggestion: {
    tab: "اقتراح تطوير",
    title: "اقتراح تطوير",
    subtitle: "أي فكرة تحسّن النظام تصلني مباشرة — ما يشوفها أي معلّم أو طالب ثاني.",
    placeholder: "اكتب اقتراحك هنا…",
    button: "إرسال الاقتراح",
    sent: "تم إرسال اقتراحك، شكراً لك ✓",
  },
  problem: {
    tab: "بلاغ مشكلة",
    title: "بلاغ عن مشكلة",
    subtitle: "واجهتك مشكلة أو خطأ بالنظام؟ اشرحها وتصلني مباشرة عشان أحلّها.",
    placeholder: "وش صار بالضبط، ومتى؟ كل تفصيل يساعد…",
    button: "إرسال البلاغ",
    sent: "تم إرسال بلاغك، بأحله بأقرب وقت ✓",
  },
} as const;

export default function SuggestPage() {
  const [type, setType] = useState<"suggestion" | "problem">("suggestion");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const copy = COPY[type];

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, type }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر الإرسال");
        return;
      }
      setMessage("");
      setSent(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-naskh text-2xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex gap-1 border-b border-border">
          {(["suggestion", "problem"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setType(value);
                setError(null);
                setSent(false);
              }}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors duration-200 ${
                type === value
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {COPY[value].tab}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={1000}
            required
            placeholder={copy.placeholder}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {sent && <p className="text-sm text-success">{copy.sent}</p>}
          <Button type="submit" disabled={busy || !message.trim()}>
            {busy ? "يُرسَل…" : copy.button}
          </Button>
        </form>
      </Card>
    </div>
  );
}
