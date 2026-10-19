"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { parseMosqueJoinInput } from "@/lib/join-link";

const INPUT =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

type Current = { role: "supervisor" | "assistant"; mosque: { name: string; city: string } | null };

/**
 * «الانضمام لجامع» — يلصق المعلّم رابط الانضمام كاملاً أو رمزه، فنستخرج الرمز
 * بالعميل ونفتح صفحة /join-mosque القائمة (معاينة + زر «انضم»). المشرف فقط
 * ينضم؛ المساعد يرى جامع الحلقة إن وُجد.
 */
export function JoinMosqueBox() {
  const router = useRouter();
  const [current, setCurrent] = useState<Current | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/teacher/mosque")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Current | null) => setCurrent(data))
      .catch(() => {});
  }, []);

  function go(event: React.FormEvent) {
    event.preventDefault();
    const code = parseMosqueJoinInput(value);
    if (!code) {
      setError("الرابط أو الرمز غير مفهوم — الصق رابط الانضمام كما وصلك من مدير الجامع");
      return;
    }
    setError(null);
    router.push(`/join-mosque?code=${encodeURIComponent(code)}`);
  }

  const canJoin = current?.role !== "assistant";

  return (
    <Card className="space-y-3 p-4">
      <h2 className="text-sm font-semibold">الانضمام لجامع</h2>
      {current?.mosque && (
        <p className="text-sm">
          حلقتك منضمّة حالياً إلى جامع <span className="font-semibold">{current.mosque.name}</span>
          {current.mosque.city ? ` — ${current.mosque.city}` : ""}.
        </p>
      )}
      {canJoin ? (
        <form onSubmit={go} className="space-y-2">
          <label className="block text-xs text-muted-foreground">
            رابط الانضمام أو رمزه
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              dir="ltr"
              placeholder="https://…/join-mosque?code=…"
              autoComplete="off"
              className={`${INPUT} mt-1 text-start`}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            اطلب رابط الانضمام من مدير الجامع (من لوحة الجامع ← رابط انضمام المعلّمين) والصقه هنا
          </p>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={!value.trim()}>متابعة</Button>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">الانضمام لجامع من صلاحية مشرف الحلقة.</p>
      )}
    </Card>
  );
}
