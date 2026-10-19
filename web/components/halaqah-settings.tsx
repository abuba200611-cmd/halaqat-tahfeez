"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

/**
 * خيار الحلقة: إعادة طلب تأكيد الزميل عند تعديل الورد — يغيّره مشرف
 * الحلقة فقط؛ المساعد يرى الحالة الحالية مقفلة. يُخفى كلياً حتى يُحمَّل
 * (نفس نمط قسم روابط الدعوة بصفحة الطلاب).
 */
export function BuddyResetSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [supervisor, setSupervisor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { buddyResetOnEdit?: boolean; role?: "supervisor" | "assistant" } | null) => {
        if (data) {
          setEnabled(Boolean(data.buddyResetOnEdit));
          setSupervisor(data.role === "supervisor");
        }
      })
      .catch(() => {});
  }, []);

  async function toggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/teacher/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buddyResetOnEdit: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "تعذّر حفظ الإعداد");
        setEnabled(previous);
      }
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setEnabled(previous);
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return null;

  return (
    <Card className="no-print p-4">
      <label className={`flex items-start gap-2 ${supervisor ? "cursor-pointer" : "cursor-not-allowed"}`}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!supervisor || busy}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium">إعادة طلب تأكيد الزميل عند تعديل الورد</span>
          <span className="block text-xs text-muted-foreground">
            إذا عدّل الطالب ورداً مؤكَّداً من زميله، يرجع التأكيد إلى «بانتظار».
          </span>
          {!supervisor && (
            <span className="mt-1 block text-xs text-muted-foreground">
              التغيير متاح لمشرف الحلقة فقط.
            </span>
          )}
        </span>
      </label>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Card>
  );
}

/** خيار الحلقة: إظهار زملاء الحلقة للطلاب — مشرف الحلقة فقط يغيّره */
export function ClassmatesVisibleSetting() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [supervisor, setSupervisor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/classmates-setting")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { classmatesVisible?: boolean; role?: "supervisor" | "assistant" } | null) => {
        if (data) {
          setEnabled(Boolean(data.classmatesVisible));
          setSupervisor(data.role === "supervisor");
        }
      })
      .catch(() => {});
  }, []);

  async function toggle(next: boolean) {
    const previous = enabled;
    setEnabled(next);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/teacher/classmates-setting", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classmatesVisible: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "تعذّر حفظ الإعداد");
        setEnabled(previous);
      }
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setEnabled(previous);
    } finally {
      setBusy(false);
    }
  }

  if (enabled === null) return null;

  return (
    <Card className="no-print p-4">
      <label className={`flex items-start gap-2 ${supervisor ? "cursor-pointer" : "cursor-not-allowed"}`}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!supervisor || busy}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span>
          <span className="block text-sm font-medium">إظهار زملاء الحلقة للطلاب</span>
          <span className="block text-xs text-muted-foreground">
            يرى كل طالب أسماء زملائه في الحلقة فقط، بلا أي بيانات أخرى. مطفأ افتراضياً.
          </span>
          {!supervisor && (
            <span className="mt-1 block text-xs text-muted-foreground">
              التغيير متاح لمشرف الحلقة فقط.
            </span>
          )}
        </span>
      </label>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Card>
  );
}

