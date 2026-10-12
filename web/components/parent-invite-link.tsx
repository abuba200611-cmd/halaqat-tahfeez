"use client";

import { useState } from "react";

/**
 * يصدر رابط دعوة ولي الأمر (STEP 61) من مسار يحدّده المستدعي (المعلّم أو
 * الطالب) ويعرضه للنسخ والمشاركة عبر واتساب. الرابط صالح ٧ أيام ولمرة واحدة؛
 * الرمز الخام يظهر هنا مرة واحدة فقط ولا يُخزَّن بالخادم إلا مجزَّأً.
 */
export function ParentInviteLink({
  endpoint,
  studentId,
  shareText,
}: {
  endpoint: string;
  /** يُرسَل فقط لمسار المعلّم — مسار الطالب يتجاهل الجسم ويأخذ هويته من الجلسة */
  studentId?: string;
  shareText: string;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studentId ? { studentId } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; token?: string };
      if (!res.ok || !data.token) {
        setError(data.error ?? "تعذّر إنشاء الرابط");
        return;
      }
      setLink(`${window.location.origin}/parent/join?token=${encodeURIComponent(data.token)}`);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError("تعذّر النسخ — انسخ الرابط يدوياً");
    }
  }

  return (
    <div className="space-y-2">
      {!link ? (
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="cursor-pointer rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "لحظة…" : "إنشاء رابط ولي الأمر"}
        </button>
      ) : (
        <>
          <input
            readOnly
            dir="ltr"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-left text-xs"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
              {copied ? "تم النسخ ✓" : "نسخ الرابط"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${shareText}\n${link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              مشاركة عبر واتساب
            </a>
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="cursor-pointer text-xs font-semibold text-slate-500 underline hover:no-underline disabled:opacity-60"
            >
              رابط جديد
            </button>
          </div>
          <p className="text-xs text-slate-500">الرابط صالح ٧ أيام ويعمل لمرة واحدة فقط.</p>
        </>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
