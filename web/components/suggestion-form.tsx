"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Card } from "@/components/ui";
import { resizeImageForUpload } from "@/lib/client-image-resize";

const COPY = {
  suggestion: {
    tab: "اقتراح تطوير",
    title: "اقتراح تطوير",
    subtitle: "أي فكرة تحسّن النظام تصلني مباشرة — ما يشوفها أي معلّم أو طالب ثاني.",
    placeholder: "اكتب اقتراحك هنا…",
    button: "إرسال الاقتراح",
    sent: "تم إرسال اقتراحك، شكراً لك ✓",
  },
  problem: {
    tab: "بلاغ مشكلة",
    title: "بلاغ عن مشكلة",
    subtitle: "واجهتك مشكلة أو خطأ بالنظام؟ اشرحها وتصلني مباشرة عشان أحلّها.",
    placeholder: "وش صار بالضبط، ومتى؟ كل تفصيل يساعد…",
    button: "إرسال البلاغ",
    sent: "تم إرسال بلاغك، بأحله بأقرب وقت ✓",
  },
} as const;

const MAX_IMAGES = 3;

type ImageEntry = { file: File; previewUrl: string };

/**
 * نموذج اقتراح/بلاغ مشترك (STEP 55) — يستخدمه المعلّم (app/(teacher)/suggest)
 * والطالب (app/(student)/student/suggest) بنفس الشكل والنصوص بالضبط،
 * فرقهما الوحيد مسار الإرسال (endpoint) وحد طول النص (maxLength).
 * الصور مسموحة فقط بتبويب "بلاغ مشكلة" — إرفاق زر أو لصق Ctrl+V.
 */
export function SuggestionForm({ endpoint, maxLength }: { endpoint: string; maxLength: number }) {
  const [type, setType] = useState<"suggestion" | "problem">("suggestion");
  const [message, setMessage] = useState("");
  const [images, setImages] = useState<ImageEntry[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copy = COPY[type];

  // ينظّف روابط المعاينة (object URLs) عند إزالة صورة أو مغادرة الصفحة — تسريب ذاكرة وإلا
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ننظّف عند unmount فقط، لا عند كل تغيّر بـimages
  }, []);

  function addFiles(files: FileList | File[]) {
    setImageError(null);
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) return;
    setImages((prev) => {
      if (prev.length >= MAX_IMAGES) {
        setImageError(`أقصى عدد صور هو ${MAX_IMAGES}`);
        return prev;
      }
      const room = MAX_IMAGES - prev.length;
      const accepted = list.slice(0, room);
      if (list.length > room) setImageError(`أقصى عدد صور هو ${MAX_IMAGES}`);
      return [...prev, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))];
    });
  }

  function removeImage(index: number) {
    setImages((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
    setImageError(null);
  }

  function switchType(next: "suggestion" | "problem") {
    setType(next);
    setError(null);
    setSent(false);
    if (next === "suggestion" && images.length > 0) {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setImages([]);
    }
  }

  function onPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (type !== "problem") return;
    const files = Array.from(event.clipboardData.items)
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => f !== null);
    if (files.length > 0) addFiles(files);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("message", message);
      body.set("type", type);
      // تصغير كل صورة بالمتصفح قبل الإرسال — حد Vercel 4.5MB لكامل الطلب
      // يُطبَّق قبل وصوله للخادم إطلاقاً، فلا يكفي الاعتماد على sharp هناك وحده
      for (const img of images) {
        try {
          const resized = await resizeImageForUpload(img.file);
          body.append("images", resized);
        } catch {
          setError("تعذّرت معالجة إحدى الصور — جرّب صورة أخرى");
          return;
        }
      }

      const res = await fetch(endpoint, { method: "POST", body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر الإرسال");
        return;
      }
      setMessage("");
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
      setImages([]);
      setSent(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="font-naskh text-2xl font-bold">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.subtitle}</p>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex gap-1 border-b border-border">
          {(["suggestion", "problem"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => switchType(value)}
              className={`-mb-px cursor-pointer border-b-2 px-3 py-2 text-sm transition-colors duration-200 ${
                type === value
                  ? "border-primary font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {COPY[value].tab}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onPaste={onPaste}
              rows={6}
              maxLength={maxLength}
              required
              placeholder={copy.placeholder}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <p className="tabular mt-1 text-left text-xs text-muted-foreground">
              {message.length}/{maxLength}
            </p>
          </div>

          {type === "problem" && (
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={images.length >= MAX_IMAGES}
                  className="text-xs"
                >
                  📎 إرفاق صورة
                </Button>
                <span className="tabular text-xs text-muted-foreground">
                  {images.length}/{MAX_IMAGES}
                </span>
                <span className="text-xs text-muted-foreground">أو الصق (Ctrl+V) صورة داخل الحقل أعلاه</span>
              </div>

              {imageError && <p className="text-xs text-destructive">{imageError}</p>}

              {images.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {images.map((img, i) => (
                    <div key={img.previewUrl} className="relative h-16 w-16 overflow-hidden rounded-md border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element -- معاينة blob: محلية مؤقتة قبل الإرسال، لا يدعمها next/image */}
                      <img src={img.previewUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        aria-label="إزالة الصورة"
                        className="absolute left-0.5 top-0.5 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
          {sent && <p className="text-sm text-success">{copy.sent}</p>}
          <Button type="submit" disabled={busy || !message.trim()}>
            {busy ? "يُرسَل…" : copy.button}
          </Button>
        </form>
      </Card>
    </div>
  );
}
