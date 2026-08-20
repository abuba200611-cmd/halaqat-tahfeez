"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

export default function SuggestPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إرسال الاقتراح");
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
        <h1 className="font-naskh text-2xl font-bold">اقتراح تطوير</h1>
        <p className="text-sm text-muted-foreground">
          أي فكرة تحسّن النظام تصلني مباشرة — ما يشوفها أي معلّم أو طالب ثاني.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={submit} className="space-y-3">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={1000}
            required
            placeholder="اكتب اقتراحك هنا…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          {sent && <p className="text-sm text-success">تم إرسال اقتراحك، شكراً لك ✓</p>}
          <Button type="submit" disabled={busy || !message.trim()}>
            {busy ? "يُرسَل…" : "إرسال"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
