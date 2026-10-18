"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Card, Empty } from "@/components/ui";

type Suggestion = {
  id: number;
  senderLabel: string;
  message: string;
  createdAt: string;
  source: "teacher" | "student";
  type: "suggestion" | "problem";
  attachments: { id: number; sizeBytes: number }[];
};

type Filter = "all" | "problem" | "suggestion";

// قائمة الاقتراحات والمشاكل — تُعرض داخل لوحة المطوّر (/dev/suggestions)
export function SuggestionsList() {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/suggestions");
      if (res.status === 401) {
        window.location.href = "/admin";
        return;
      }
      const data = (await res.json()) as { suggestions?: Suggestion[] };
      setSuggestions(data.suggestions ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (suggestions ?? []).filter((s) => filter === "all" || s.type === filter),
    [suggestions, filter],
  );
  const problemCount = useMemo(
    () => (suggestions ?? []).filter((s) => s.type === "problem").length,
    [suggestions],
  );

  if (loading || !suggestions) return <Empty title="جارٍ التحميل…" />;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <h1 className="mb-1 font-display text-2xl font-bold">اقتراحات ومشاكل المعلّمين والطلاب</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        {suggestions.length} رسالة من النظامين — الأحدث أولاً
        {problemCount > 0 && ` · ${problemCount} مشكلة تحتاج حل`}
      </p>

      <div className="mb-4 flex gap-1 border-b border-border">
        {(
          [
            ["all", `الكل (${suggestions.length})`],
            ["problem", `المشاكل (${problemCount})`],
            ["suggestion", `الاقتراحات (${suggestions.length - problemCount})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value as Filter)}
            className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors duration-200 ${
              filter === value
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <Empty title="ما فيه شيء بهذا التصنيف." />
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={`${s.source}-${s.id}`}>
              <Card className={`p-4 ${s.type === "problem" ? "border-destructive/40" : ""}`}>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <Badge tone={s.type === "problem" ? "warn" : "good"}>
                      {s.type === "problem" ? "🐛 مشكلة" : "💡 اقتراح"}
                    </Badge>
                    <Badge tone={s.source === "teacher" ? "good" : "neutral"}>
                      {s.source === "teacher" ? "معلّم" : "طالب"}
                    </Badge>
                    <span className="font-semibold text-foreground">{s.senderLabel}</span>
                  </span>
                  <span className="tabular">{s.createdAt.slice(0, 16).replace("T", " ")}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm">{s.message}</p>
                {s.attachments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={`/api/admin/suggestions/attachments/${a.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="block h-16 w-16 overflow-hidden rounded-md border border-border"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- صورة أدمن محمية بجلسة، لا حاجة لتحسين next/image */}
                        <img
                          src={`/api/admin/suggestions/attachments/${a.id}`}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      </a>
                    ))}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
