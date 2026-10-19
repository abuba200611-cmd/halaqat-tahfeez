"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { DISPLAY_NAME_MAX, normalizeDisplayName } from "@/lib/account-settings";

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

/** تعديل اسم العرض — يرسل `{ name }` فقط للمسار المعطى (الهوية من الجلسة بالخادم) */
export function ProfileNameForm({
  endpoint,
  initialName,
  onSaved,
}: {
  endpoint: string;
  initialName: string;
  onSaved?: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const checked = normalizeDisplayName(name);
    if (!checked.ok) {
      setMessage({ ok: false, text: checked.error });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: checked.name }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; name?: string };
      if (!res.ok) {
        setMessage({ ok: false, text: data.error ?? "تعذّر حفظ الاسم" });
        return;
      }
      setName(data.name ?? checked.name);
      setMessage({ ok: true, text: "تم حفظ الاسم" });
      onSaved?.(data.name ?? checked.name);
    } catch {
      setMessage({ ok: false, text: "تعذّر الاتصال بالخادم" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <form onSubmit={save} className="space-y-3">
        <h2 className="text-sm font-semibold">الاسم</h2>
        <label className="block text-xs text-muted-foreground">
          اسم العرض
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={DISPLAY_NAME_MAX + 20}
            autoComplete="name"
            className={`${INPUT} mt-1`}
          />
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? "لحظة…" : "حفظ الاسم"}</Button>
          {message && (
            <p role="status" className={`text-sm ${message.ok ? "text-success" : "text-destructive"}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}
