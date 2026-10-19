"use client";

import { useRef, useState } from "react";
import { Badge, Button, Card } from "@/components/mosque/ui";

/*
  لوحة استيراد الطلاب (مشتركة بين مدير الجامع والمعلّم): اختيار ملف ← معاينة بأخطاء كل
  صف ← تأكيد. الملف نفسه يُرسل للخادم في الخطوتين؛ الخادم يعيد قراءته والتحقق منه عند
  التأكيد، فلا قيمة لأي تلاعب بنتيجة المعاينة هنا.
*/

type Row = {
  line: number;
  name: string;
  phone: string;
  parentPhone: string;
  birthYear: number | null;
  halaqahName: string;
  status: "ok" | "error" | "duplicate";
  errors: string[];
  warnings: string[];
};
type Summary = { total: number; valid: number; errors: number; duplicates: number };
type Result = { rows: Row[]; summary: Summary; created?: number; skipped?: number; autoAssigned?: number; waitlisted?: number };

const STATUS_TEXT: Record<Row["status"], string> = { ok: "سليم", error: "خطأ", duplicate: "مكرر" };

export function ImportPanel({ endpoint, templateUrl, showHalaqah }: { endpoint: string; templateUrl: string; showHalaqah: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Result | null>(null);
  const [done, setDone] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(mode: "preview" | "commit") {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mode", mode);
      const res = await fetch(endpoint, { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as Result & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر تنفيذ الطلب");
        return;
      }
      if (mode === "preview") setPreview(data);
      else {
        setDone(data);
        setPreview(null);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  function pick(next: File | null) {
    setFile(next);
    setPreview(null);
    setDone(null);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <p className="text-sm text-muted-foreground">
          ارفع ملف <span dir="ltr">.xlsx</span> أو <span dir="ltr">.csv</span> (حتى ١٠٠٠ صف و٢ ميغابايت). الأعمدة: الاسم (مطلوب)،
          الجوال، جوال ولي الأمر، سنة الميلاد{showHalaqah ? "، الحلقة" : ""}، ملاحظات.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <a href={templateUrl} className="text-sm text-accent-ink hover:underline">
            تنزيل القالب
          </a>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.csv"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
            className="text-sm file:me-3 file:cursor-pointer file:rounded-full file:border file:border-border file:bg-surface file:px-4 file:py-1.5 file:text-sm"
            aria-label="ملف الاستيراد"
          />
          <Button onClick={() => send("preview")} disabled={!file || busy}>
            {busy && !preview ? "جارٍ الفحص…" : "معاينة"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {done && (
        <Card className="space-y-1 bg-success-soft p-4 text-sm">
          <p className="font-semibold text-success">تم الاستيراد</p>
          <p>
            أُنشئ <span className="tabular font-bold">{done.created}</span> · تُخطّي{" "}
            <span className="tabular font-bold">{done.skipped}</span> (مكرر أو به أخطاء)
          </p>
          {done.autoAssigned || done.waitlisted ? (
            <p className="text-muted-foreground">
              التوزيع الآلي: وُزّع {done.autoAssigned ?? 0} · بالانتظار {done.waitlisted ?? 0}
            </p>
          ) : null}
        </Card>
      )}

      {preview && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="good">سليم {preview.summary.valid}</Badge>
            <Badge tone="warn">أخطاء {preview.summary.errors}</Badge>
            <Badge>مكرر {preview.summary.duplicates}</Badge>
            <span className="text-muted-foreground">من {preview.summary.total} صف</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-2 py-1.5 text-start">الصف</th>
                  <th className="px-2 py-1.5 text-start">الاسم</th>
                  <th className="px-2 py-1.5 text-start">الجوال</th>
                  {showHalaqah && <th className="px-2 py-1.5 text-start">الحلقة</th>}
                  <th className="px-2 py-1.5 text-start">الحالة</th>
                  <th className="px-2 py-1.5 text-start">ملاحظات الفحص</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.line} className="border-b border-border/60 align-top">
                    <td className="tabular px-2 py-1.5">{row.line}</td>
                    <td className="px-2 py-1.5">{row.name || "—"}</td>
                    <td className="tabular px-2 py-1.5" dir="ltr">
                      {row.phone || "—"}
                    </td>
                    {showHalaqah && <td className="px-2 py-1.5">{row.halaqahName || "—"}</td>}
                    <td className="px-2 py-1.5">
                      <Badge tone={row.status === "ok" ? "good" : row.status === "error" ? "warn" : "neutral"}>
                        {STATUS_TEXT[row.status]}
                      </Badge>
                    </td>
                    <td className="px-2 py-1.5 text-xs">
                      {row.errors.map((message) => (
                        <p key={message} className="text-destructive">
                          {message}
                        </p>
                      ))}
                      {row.warnings.map((message) => (
                        <p key={message} className="text-muted-foreground">
                          {message}
                        </p>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => send("commit")} disabled={busy || preview.summary.valid === 0}>
              {busy ? "جارٍ الحفظ…" : `تأكيد استيراد ${preview.summary.valid} طالباً`}
            </Button>
            <span className="text-xs text-muted-foreground">الصفوف ذات الأخطاء والمكررة تُتخطّى، ويُعاد فحص الملف عند التأكيد.</span>
          </div>
        </Card>
      )}
    </div>
  );
}
