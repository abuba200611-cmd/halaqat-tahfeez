"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Empty } from "@/components/ui";

type Suggestion = { id: number; senderLabel: string; message: string; createdAt: string };

export default function AdminPage() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/suggestions");
      if (res.status === 401) {
        setNeedsLogin(true);
        return;
      }
      const data = (await res.json()) as { suggestions?: Suggestion[] };
      setSuggestions(data.suggestions ?? []);
      setNeedsLogin(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (needsLogin) return <AdminLogin onIn={load} />;
  if (loading || !suggestions) return <Empty title="جارٍ التحميل…" />;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <h1 className="mb-1 font-naskh text-2xl font-bold">اقتراحات المعلّمين</h1>
      <p className="mb-6 text-sm text-muted-foreground">{suggestions.length} اقتراح — الأحدث أولاً</p>

      {suggestions.length === 0 ? (
        <Empty title="ما وصل اقتراح بعد." />
      ) : (
        <ul className="space-y-2">
          {suggestions.map((s) => (
            <li key={s.id}>
              <Card className="p-4">
                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{s.senderLabel}</span>
                  <span className="tabular">{s.createdAt.slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{s.message}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function AdminLogin({ onIn }: { onIn: () => Promise<void> }) {
  const [secret, setSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      });
      if (!res.ok) {
        setError("كلمة السر غير صحيحة");
        return;
      }
      await onIn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <Card className="p-5">
        <h1 className="mb-4 text-center font-naskh text-xl font-bold">لوحة المطوّر</h1>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="كلمة السر"
            autoFocus
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "لحظة…" : "دخول"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
