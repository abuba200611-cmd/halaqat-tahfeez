"use client";

import { useState } from "react";
import { Button, Card } from "./ui";
import type { Student } from "@/lib/types";

/**
 * يربط طالباً في هذا النظام باسم مستخدمه في نظام تسجيل الورد المستقل
 * (tasjeel-tullab)، ويسحب آخر حفظ ومراجعة سجّلهما بنفسه. أول استخدام
 * يطلب اسم المستخدم؛ بعدها يكفي زر "تحديث" لإعادة السحب بنفس الرابط.
 */
export function LinkPanel({
  student,
  linkUsername,
  summaryLabel,
  onClose,
  onLinked,
}: {
  student: Student;
  linkUsername?: string;
  summaryLabel?: string;
  onClose: () => void;
  onLinked: (linkUsername: string, summaryLabel: string, updated: Student) => void;
}) {
  const [username, setUsername] = useState(linkUsername ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pull(explicitUsername?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/students/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          linkUsername: explicitUsername ?? username.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        linkUsername?: string;
        summaryLabel?: string;
        student?: Student;
      };
      if (!res.ok || !data.student) {
        setError(data.error ?? "تعذّر السحب");
        return;
      }
      onLinked(data.linkUsername ?? username.trim(), data.summaryLabel ?? "", data.student);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <Card className="no-print p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          الربط بتسجيل الورد: <span className="font-naskh">{student.name}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          إغلاق
        </button>
      </div>

      {linkUsername ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">
            مربوط باسم المستخدم <span className="tabular font-medium text-foreground">{linkUsername}</span>
          </p>
          {summaryLabel && <p className="text-muted-foreground">آخر سحب: {summaryLabel}</p>}
          {error && <p className="text-destructive">{error}</p>}
          <Button onClick={() => pull(linkUsername)} disabled={busy}>
            {busy ? "يُسحب…" : "تحديث من تسجيل الطالب"}
          </Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void pull();
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-xs text-muted-foreground">
              اسم مستخدم الطالب في نظام تسجيل الورد
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className={field}
            />
          </label>
          <div className="sm:col-span-2">
            {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy}>
              {busy ? "يُسحب…" : "ربط وسحب"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              يطلب الطالب هذا الاسم من نظام تسجيل الورد الخاص به ويعطيه لك مرة واحدة.
            </p>
          </div>
        </form>
      )}
    </Card>
  );
}
