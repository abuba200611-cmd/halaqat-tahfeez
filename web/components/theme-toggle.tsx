"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { THEME_OPTIONS, applyTheme, readStoredTheme, type ThemeChoice } from "@/lib/theme";

/** بطاقة «المظهر» — تُضاف لكل صفحات الإعدادات. الاختيار محلي لهذا المتصفح فقط. */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>("auto");

  useEffect(() => {
    // قراءة التخزين المحلي لا تتوفر قبل التركيب — نزامن الحالة معها مرة واحدة
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(readStoredTheme());
  }, []);

  function pick(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
  }

  return (
    <Card className="no-print space-y-3 p-4">
      <h2 className="text-sm font-semibold">المظهر</h2>
      <div role="radiogroup" aria-label="المظهر" className="inline-flex overflow-hidden rounded-md border border-border">
        {THEME_OPTIONS.map((option) => {
          const active = choice === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => pick(option.value)}
              className={`cursor-pointer px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring ${
                active ? "bg-primary text-on-primary" : "bg-surface text-foreground hover:bg-muted"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">يُحفظ الاختيار على هذا المتصفح فقط. «تلقائي» يتبع إعداد جهازك.</p>
    </Card>
  );
}
