"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { LEGACY_STAGE_LABEL_AR, STAGES, STAGE_LABEL_AR, type HalaqahStage } from "@/lib/halaqah-stage";
import { WARD_UNIT_LABEL_AR } from "@/lib/ward-units";

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

type StageSettingsData = {
  stage?: HalaqahStage | null;
  role?: "supervisor" | "assistant";
};

/**
 * فئة الحلقة العمرية (001 US1، FR-001): تختار نمط تسجيل الورد لكل طلاب
 * الحلقة — مشرف الحلقة فقط يغيّرها، والمساعد يراها مقفلة. الحلقة بلا فئة
 * على «الفئة الافتراضية» (النمط الحالي نفسه) ورسالة توضح ذلك (سيناريو ١).
 */
export function StageSetting() {
  const [stage, setStage] = useState<HalaqahStage | null | "loading">("loading");
  const [supervisor, setSupervisor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: StageSettingsData | null) => {
        if (data) {
          setStage(data.stage ?? null);
          setSupervisor(data.role === "supervisor");
        } else {
          setStage(null);
        }
      })
      .catch(() => setStage(null));
  }, []);

  async function pick(next: HalaqahStage | null) {
    const previous = stage;
    setStage(next);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/teacher/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "تعذّر حفظ الفئة");
        setStage(previous);
      }
    } catch {
      setError("تعذّر الاتصال بالخادم");
      setStage(previous);
    } finally {
      setBusy(false);
    }
  }

  if (stage === "loading") return null;

  // أزرار الفئة بترتيب العمر — «افتراضي» أولاً لأنه حالة الحلقات القائمة
  const UNIT_OF_STAGE: Record<HalaqahStage, string> = {
    primary: WARD_UNIT_LABEL_AR.surah_ayah,
    intermediate: WARD_UNIT_LABEL_AR.ayah_page,
    secondary: WARD_UNIT_LABEL_AR.page_wajh,
    university: WARD_UNIT_LABEL_AR.wajh_juz,
  };
  const options: { value: HalaqahStage | null; label: string; hint: string }[] = [
    { value: null, label: LEGACY_STAGE_LABEL_AR, hint: WARD_UNIT_LABEL_AR.ayah_page },
    ...STAGES.map((s) => ({
      value: s,
      label: STAGE_LABEL_AR[s],
      hint: s === "primary" ? `${UNIT_OF_STAGE[s]} · المعلّم يسجّل الورد` : UNIT_OF_STAGE[s],
    })),
  ];

  return (
    <Card className="no-print p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-medium">الفئة العمرية للحلقة</h3>
        <p className="text-xs text-muted-foreground">
          تحدّد طريقة تسجيل الورد لكل طلاب الحلقة (الوحدة ومن يسجّل).
          {stage === null ? " الفئة الافتراضية مطبّقة — النمط الحالي نفسه." : ""}
        </p>
      </div>
      <fieldset
        disabled={!supervisor || busy}
        className="mt-3 grid grid-cols-2 gap-2 disabled:opacity-60 sm:grid-cols-3"
      >
        <legend className="sr-only">اختر الفئة العمرية</legend>
        {options.map((opt) => {
          const selected = stage === opt.value;
          return (
            <button
              key={opt.label}
              type="button"
              aria-pressed={selected}
              onClick={() => !selected && pick(opt.value)}
              className={`min-h-11 cursor-pointer rounded-xl border px-3 py-2.5 text-right transition-colors duration-200 disabled:cursor-not-allowed ${
                selected
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-border bg-surface text-foreground hover:bg-muted"
              }`}
            >
              <span className="block text-sm font-semibold">{opt.label}</span>
              <span className="block text-xs text-muted-foreground">{opt.hint}</span>
            </button>
          );
        })}
      </fieldset>
      {!supervisor && <p className="mt-2 text-xs text-muted-foreground">التغيير متاح لمشرف الحلقة فقط.</p>}
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </Card>
  );
}

