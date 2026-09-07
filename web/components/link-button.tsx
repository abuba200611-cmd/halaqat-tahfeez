"use client";

import { useState } from "react";
import { Button, Card } from "./ui";
import type { Student } from "@/lib/types";

/**
 * يسحب أحدث ملخّص لطالب له ربط محفوظ مسبقاً بنظام تسجيل الورد المستقل
 * (tasjeel-tullab). الربط نفسه يُنشأ تلقائياً حين ينضم الطالب عبر رابط
 * الدعوة (STEP 27/36) — لا مسار هنا لإنشائه يدوياً، فاسم المستخدم لا
 * يُرسَل بأي طلب: الخادم يعتمد حصراً على الرابط المحفوظ سلفاً.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pull() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/students/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id }),
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
      onLinked(data.linkUsername ?? linkUsername ?? "", data.summaryLabel ?? "", data.student);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

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
          <Button onClick={() => pull()} disabled={busy}>
            {busy ? "يُسحب…" : "تحديث من تسجيل الطالب"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          لم يُربط بعد بنظام تسجيل الورد — الربط يُنشأ تلقائياً حين ينضم الطالب عبر رابط الدعوة (بأعلى صفحة الطلاب).
        </p>
      )}
    </Card>
  );
}
