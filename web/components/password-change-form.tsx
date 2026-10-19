"use client";

import { useEffect, useState } from "react";
import { Button, Card } from "@/components/ui";
import { MIN_PASSWORD_LENGTH, validatePasswordChange } from "@/lib/account-settings";

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

/**
 * تغيير كلمة المرور من داخل الحساب: الحالية + الجديدة + التأكيد. يسأل المسار
 * (GET) هل للحساب كلمة مرور محلية؛ حساب جوجل فقط يرى ملاحظة بدل النموذج.
 */
export function PasswordChangeForm({ endpoint, note }: { endpoint: string; note?: string }) {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch(endpoint)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { hasPassword?: boolean } | null) => setHasPassword(data ? data.hasPassword !== false : true))
      .catch(() => setHasPassword(true));
  }, [endpoint]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const body = { currentPassword: current, newPassword: next, confirmPassword: confirm };
    const checked = validatePasswordChange(body);
    if (!checked.ok) {
      setMessage({ ok: false, text: checked.error });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        if (data.code === "google_only") setHasPassword(false);
        setMessage({ ok: false, text: data.error ?? "تعذّر تغيير كلمة المرور" });
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      setMessage({ ok: true, text: "تم تغيير كلمة المرور" });
    } catch {
      setMessage({ ok: false, text: "تعذّر الاتصال بالخادم" });
    } finally {
      setBusy(false);
    }
  }

  if (hasPassword === null) return null;

  if (!hasPassword) {
    return (
      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold">كلمة المرور</h2>
        <p className="text-sm text-muted-foreground">كلمة المرور مُدارة من جوجل — تغيّرها من حساب جوجل نفسه.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={submit} className="space-y-3">
        <h2 className="text-sm font-semibold">تغيير كلمة المرور</h2>
        <label className="block text-xs text-muted-foreground">
          كلمة المرور الحالية
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className={`${INPUT} mt-1`}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          كلمة المرور الجديدة ({MIN_PASSWORD_LENGTH} أحرف فأكثر)
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className={`${INPUT} mt-1`}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          تأكيد كلمة المرور الجديدة
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            className={`${INPUT} mt-1`}
          />
        </label>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy}>{busy ? "لحظة…" : "تغيير كلمة المرور"}</Button>
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
