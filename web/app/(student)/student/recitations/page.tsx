"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AyahRangeInputs } from "@/components/ayah-range-field";
import { RecitationCard } from "@/components/recitation-card";
import {
  RECITATION_MAX_BYTES,
  RECITATION_MAX_SECONDS,
  RECITATIONS_PER_DAY,
  baseMime,
  formatDuration,
  validateRecitationRange,
  type RecitationView,
} from "@/lib/recitations";
import type { AyahRangeInput } from "@/lib/ward-ayah";

/*
  STEP 64 — "تلاواتي": الطالب يسجّل تلاوته بالمتصفح (MediaRecorder) أو يرفع ملفاً،
  يراجعها بالاستماع، ثم يرسلها للمعلّم. الحدود (٣ دقائق، ٣MB) تُفحص هنا للراحة
  فقط — الخادم هو المرجع ويفحص البايتات الفعلية.
*/

type Clip = { blob: Blob; url: string; durationSec: number; mime: string };

const EMPTY_RANGE: AyahRangeInput = { from: { surah: null, ayah: null }, to: { surah: null, ayah: null } };
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

/** مدة ملف صوتي من بياناته الوصفية (يعالج webm الذي يعيد Infinity بحيلة القفز للنهاية) */
function readAudioDuration(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.preload = "metadata";
    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      audio.removeAttribute("src");
      resolve(value);
    };
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) return done(audio.duration);
      audio.ontimeupdate = () => {
        audio.ontimeupdate = null;
        done(Number.isFinite(audio.duration) ? audio.duration : null);
      };
      audio.currentTime = 1e101;
    };
    audio.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    audio.src = url;
  });
}

function extensionOf(mime: string): string {
  const m = baseMime(mime);
  if (m === "audio/mp4" || m === "audio/x-m4a") return "m4a";
  if (m === "audio/mpeg") return "mp3";
  if (m === "audio/ogg") return "ogg";
  if (m === "audio/aac") return "aac";
  return "webm";
}

export default function StudentRecitationsPage() {
  const [range, setRange] = useState<AyahRangeInput>(EMPTY_RANGE);
  const [clip, setClip] = useState<Clip | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [items, setItems] = useState<RecitationView[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student/recitations")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("load"))))
      .then((data: { recitations: RecitationView[] }) => {
        if (cancelled) return;
        setItems(data.recitations);
        setLoadFailed(false);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // يحرّر رابط المعاينة عند استبدال المقطع أو مغادرة الصفحة
  useEffect(() => {
    if (!clip) return;
    const url = clip.url;
    return () => URL.revokeObjectURL(url);
  }, [clip]);

  // مغادرة الصفحة أثناء التسجيل: أوقف المؤقّت والميكروفون
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const releaseMic = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }, []);

  async function startRecording() {
    setError(null);
    setNotice(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("متصفحك لا يدعم التسجيل — ارفع ملفاً صوتياً بدلاً من ذلك.");
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("تعذّر الوصول للميكروفون — اسمح به من إعدادات المتصفح، أو ارفع ملفاً.");
      return;
    }

    const supported = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    // معدل منخفض (٣٢kbps) يُبقي ٣ دقائق أقل من ١MB
    const recorder = new MediaRecorder(stream, {
      ...(supported ? { mimeType: supported } : {}),
      audioBitsPerSecond: 32000,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      const mime = recorder.mimeType || supported || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      releaseMic();
      setRecording(false);
      if (blob.size > RECITATION_MAX_BYTES) {
        setError("حجم التلاوة أكبر من 3 ميغابايت — سجّل مقطعاً أقصر.");
        return;
      }
      setClip({ blob, url: URL.createObjectURL(blob), durationSec: Math.min(seconds, RECITATION_MAX_SECONDS), mime });
    };

    recorderRef.current = recorder;
    streamRef.current = stream;
    startedAtRef.current = Date.now();
    setElapsed(0);
    setClip(null);
    recorder.start();
    setRecording(true);
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
      setElapsed(secs);
      if (secs >= RECITATION_MAX_SECONDS) stopRecording();
    }, 250);
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    if (file.size > RECITATION_MAX_BYTES) {
      setError("حجم الملف أكبر من 3 ميغابايت.");
      return;
    }
    const url = URL.createObjectURL(file);
    const seconds = await readAudioDuration(url);
    if (seconds === null) {
      URL.revokeObjectURL(url);
      setError("تعذّرت قراءة الملف الصوتي — جرّب ملفاً آخر.");
      return;
    }
    if (seconds > RECITATION_MAX_SECONDS + 1) {
      URL.revokeObjectURL(url);
      setError("أقصى مدة للتلاوة 3 دقائق.");
      return;
    }
    setClip({ blob: file, url, durationSec: Math.max(1, Math.ceil(seconds)), mime: file.type });
  }

  const rangeCheck = validateRecitationRange(range.from.surah, range.from.ayah, range.to.ayah);
  const sameSurah = range.from.surah === range.to.surah;
  const touched = range.from.surah !== null || range.from.ayah !== null || range.to.ayah !== null;
  const rangeError = !touched
    ? null
    : !sameSurah
      ? "اختر نطاقاً داخل سورة واحدة"
      : rangeCheck.ok
        ? null
        : range.from.ayah !== null && range.to.ayah !== null
          ? rangeCheck.error
          : null;
  const canSend = !!clip && !recording && !sending && rangeCheck.ok && sameSurah;

  async function send() {
    if (!clip || !rangeCheck.ok) return;
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("surah", String(rangeCheck.range.surah));
      form.set("fromAyah", String(rangeCheck.range.fromAyah));
      form.set("toAyah", String(rangeCheck.range.toAyah));
      form.set("durationSec", String(clip.durationSec));
      form.set(
        "audio",
        new File([clip.blob], `recitation.${extensionOf(clip.mime)}`, { type: baseMime(clip.mime) }),
      );
      const res = await fetch("/api/student/recitations", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إرسال التلاوة");
        return;
      }
      setClip(null);
      setNotice("وصلت تلاوتك للمعلّم ✅");
      setReload((n) => n + 1);
    } catch {
      setError("تعذّر الاتصال — حاول مرة أخرى.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-stone-800">تلاواتي</h1>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-stone-700">تلاوة جديدة</h2>
        <AyahRangeInputs idPrefix="recitation" value={range} onChange={setRange} error={rangeError} pageLabel={null} />

        <div className="space-y-2">
          {recording ? (
            <div className="flex items-center gap-3">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" aria-hidden="true" />
              <span className="tabular text-sm font-semibold text-stone-700" aria-live="off">
                {formatDuration(elapsed)} / {formatDuration(RECITATION_MAX_SECONDS)}
              </span>
              <button
                type="button"
                onClick={stopRecording}
                className="cursor-pointer rounded-xl bg-destructive px-4 py-2 text-sm font-bold text-white hover:bg-destructive"
              >
                إيقاف
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={startRecording}
                disabled={sending}
                className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {clip ? "إعادة التسجيل" : "ابدأ التسجيل"}
              </button>
              <label className="cursor-pointer rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50">
                رفع ملف صوتي
                <input type="file" accept="audio/*" onChange={onPickFile} disabled={sending} className="sr-only" />
              </label>
            </div>
          )}

          {clip && !recording && (
            <div className="space-y-1.5">
              <audio controls src={clip.url} className="h-10 w-full" />
              <p className="tabular text-xs text-stone-500">المدة {formatDuration(clip.durationSec)}</p>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        {notice && <p className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">{notice}</p>}

        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          className="w-full cursor-pointer rounded-xl bg-success px-4 py-2.5 text-sm font-bold text-white hover:bg-success disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "جارٍ الإرسال…" : "إرسال للمعلّم"}
        </button>
        <p className="text-[11px] text-stone-400">
          أقصى مدة 3 دقائق، وحتى {RECITATIONS_PER_DAY} تلاوات في اليوم.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-stone-700">تلاواتي السابقة</h2>
        {items === null && !loadFailed ? (
          <p className="text-sm text-stone-500">جارٍ التحميل…</p>
        ) : loadFailed && items === null ? (
          <p className="text-sm text-destructive">تعذّر تحميل التلاوات.</p>
        ) : items && items.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
            لم ترسل أي تلاوة بعد.
          </p>
        ) : (
          <ul className="space-y-2">
            {items?.map((r) => (
              <RecitationCard key={r.id} item={r} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
