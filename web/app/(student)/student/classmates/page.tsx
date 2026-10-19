"use client";

import { useEffect, useState } from "react";

/*
  "زملائي في الحلقة" — أسماء طلاب حلقتي فقط، بلا أي بيانات أخرى. إن عطّل
  المعلّم الميزة يردّ الخادم 403 فنعرض رسالة بدل القائمة.
*/

type State = { status: "loading" } | { status: "disabled" } | { status: "error" } | { status: "ok"; names: string[] };

export default function StudentClassmatesPage() {
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student/classmates")
      .then(async (res): Promise<State> => {
        if (res.status === 403 || res.status === 404) return { status: "disabled" };
        if (!res.ok) return { status: "error" };
        const data = (await res.json()) as { classmates?: { name: string }[] };
        return { status: "ok", names: (data.classmates ?? []).map((c) => c.name) };
      })
      .catch((): State => ({ status: "error" }))
      .then((next) => {
        if (!cancelled) setState(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-foreground">زملائي في الحلقة</h1>
      <p className="text-sm text-muted-foreground">أسماء طلاب حلقتك.</p>

      {state.status === "loading" && <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>}
      {state.status === "error" && <p className="text-sm text-destructive">تعذّر تحميل القائمة.</p>}
      {state.status === "disabled" && (
        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-sm text-muted-foreground">عرض زملاء الحلقة غير مفعّل من معلّمك.</p>
        </div>
      )}
      {state.status === "ok" &&
        (state.names.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا يوجد طلاب بعد.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {state.names.map((name, index) => (
              <li
                key={`${index}-${name}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3"
              >
                <span className="tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-bold text-accent-ink">
                  {(name || "ط").trim().charAt(0)}
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-foreground">{name}</span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
