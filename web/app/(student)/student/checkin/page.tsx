"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/*
  صفحة وجهة رمز الحضور (/student/checkin?t=…): الطالب مسجّل الدخول (بوابة
  الطالب تعرض الدخول قبل هذه الصفحة وتعود إليها)، فنرسل الرمز للخادم الذي
  يتحقق منه ويسجّل الحضور. الرمز يُزال من شريط العنوان بعد القراءة.
*/

type State =
  | { kind: "loading" }
  | { kind: "done"; alreadyRecorded: boolean; statusLabel: string }
  | { kind: "error"; message: string };

export default function StudentCheckinPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  // يُقرأ مرة واحدة ويُحتفظ به (إعادة تشغيل التأثير في الوضع الصارم لا تجد العنوان بعد تنظيفه)
  const tokenRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (tokenRef.current === undefined) {
      tokenRef.current = new URLSearchParams(window.location.search).get("t");
      // لا يبقى الرمز بالعنوان/السجل بعد قراءته
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = tokenRef.current;

    async function run() {
      if (!token) {
        setState({ kind: "error", message: "لا يوجد رمز — امسح الرمز من شاشة معلّمك" });
        return;
      }
      try {
        const res = await fetch("/api/student/checkin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ t: token }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          alreadyRecorded?: boolean;
          statusLabel?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: data.error ?? "تعذّر تسجيل الحضور" });
          return;
        }
        setState({ kind: "done", alreadyRecorded: data.alreadyRecorded === true, statusLabel: data.statusLabel ?? "حاضر" });
      } catch {
        if (!cancelled) setState({ kind: "error", message: "تعذّر الاتصال بالخادم — حاول مرة أخرى" });
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-4 py-8 text-center">
      <h1 className="font-display text-xl font-bold">تسجيل الحضور</h1>

      {state.kind === "loading" && <p className="text-sm text-muted-foreground">جارٍ تسجيل حضورك…</p>}

      {state.kind === "done" && (
        <div role="status" className="space-y-1 rounded-lg border border-border bg-success-soft p-5">
          <p className="text-lg font-bold text-success">
            {state.alreadyRecorded ? `حضورك مسجّل مسبقاً — ${state.statusLabel}` : "تم تسجيل حضورك"}
          </p>
          <p className="text-sm text-muted-foreground">بارك الله فيك.</p>
        </div>
      )}

      {state.kind === "error" && (
        <div role="alert" className="space-y-1 rounded-lg border border-border bg-destructive-soft p-5">
          <p className="font-semibold text-destructive">{state.message}</p>
        </div>
      )}

      {state.kind !== "loading" && (
        <Link
          href="/student"
          className="inline-flex min-h-11 items-center rounded-md bg-primary px-4 text-sm font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          الرئيسية
        </Link>
      )}
    </div>
  );
}
