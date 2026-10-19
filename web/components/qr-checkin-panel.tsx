"use client";

import { useEffect, useMemo, useState } from "react";
import { create as createQr } from "qrcode";
import { Card } from "@/components/ui";
import type { AttendanceRow } from "@/lib/attendance";

/*
  لوحة «حضور بالرمز» للمعلّم: رمز QR دوّار (يتجدد كل ٣٠ ثانية من الخادم) يمسحه
  الطلاب بجوالاتهم، وقائمة حيّة بمن سجّل حضوره بالرمز. القائمة تتغذّى من صفوف
  الحضور القائمة (الصفحة الأم تعيد جلبها كل ٥ ثوانٍ) — لا نظام موازٍ.

  ألوان الرمز نفسها ثابتة (وحدات سوداء على أرضية بيضاء بهامش هادئ) عن قصد: ماسحات
  الكاميرا تتعثر بالرمز المعكوس أو منخفض التباين، فلا يتبع الوضع الداكن هنا.
*/

type QrPayload = { enabled: boolean; token?: string; path?: string; expiresAt?: number; windowMs?: number };

const QUIET = 4;
const MIN_REFRESH_MS = 2_000;
const MAX_REFRESH_MS = 30_000;

function QrSvg({ text }: { text: string }) {
  const { size, d } = useMemo(() => {
    const qr = createQr(text, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const data = qr.modules.data;
    let path = "";
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (data[y * n + x]) path += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
      }
    }
    return { size: n + QUIET * 2, d: path };
  }, [text]);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="رمز QR لتسجيل الحضور"
      shapeRendering="crispEdges"
      className="force-light aspect-square w-full max-w-72 rounded-lg border border-border bg-white"
    >
      <path d={d} className="fill-black" />
    </svg>
  );
}

export function QrCheckinPanel({ rows, onClose }: { rows: AttendanceRow[]; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [expiresAt, setExpiresAt] = useState(0);

  // يجلب الرمز ثم يجدّده قبيل نهاية نافذته؛ الخادم هو من يحدّد النافذة
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load() {
      let delay = MAX_REFRESH_MS;
      try {
        const res = await fetch("/api/attendance/qr", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as QrPayload;
        if (cancelled) return;
        if (!res.ok || !data.enabled || !data.path) {
          setError(res.status === 429 ? "طلبات كثيرة — انتظر قليلاً" : "تعذّر توليد الرمز");
          delay = MAX_REFRESH_MS;
        } else {
          setError(null);
          setUrl(`${window.location.origin}${data.path}`);
          const end = data.expiresAt ?? Date.now() + MAX_REFRESH_MS;
          setExpiresAt(end);
          delay = Math.min(MAX_REFRESH_MS, Math.max(MIN_REFRESH_MS, end - Date.now() + 500));
        }
      } catch {
        if (!cancelled) setError("تعذّر الاتصال بالخادم");
      }
      if (!cancelled) timer = setTimeout(load, delay);
    }
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const tick = () => setSecondsLeft(Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const checkedIn = rows
    .filter((r) => r.viaQr)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  const present = rows.filter((r) => r.status === "present" || r.status === "late").length;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold">حضور بالرمز</h2>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 cursor-pointer rounded-md border border-border bg-surface px-3 text-sm font-medium transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          إغلاق
        </button>
      </div>

      <div className="flex flex-col items-center gap-2">
        {url ? <QrSvg text={url} /> : <p className="py-12 text-sm text-muted-foreground">جارٍ توليد الرمز…</p>}
        {url && (
          <p className="tabular text-xs text-muted-foreground" aria-live="off">
            يتجدد الرمز تلقائياً — بعد {secondsLeft} ث
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-md bg-destructive-soft px-3 py-1.5 text-sm text-destructive">
            {error}
          </p>
        )}
        <p className="text-center text-xs text-muted-foreground">
          يمسح الطالب الرمز بكاميرا جواله وهو مسجّل الدخول ببرنامج الطالب، فيُسجَّل حاضراً اليوم. لا يُستخدم موقع الجهاز.
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">سجّلوا الآن</h3>
          <span className="tabular text-xs text-muted-foreground">
            {checkedIn.length} بالرمز · {present} حاضر إجمالاً
          </span>
        </div>
        {checkedIn.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم يمسح أحد الرمز بعد.</p>
        ) : (
          <ul className="space-y-1" aria-live="polite">
            {checkedIn.map((r) => (
              <li key={r.studentId} className="flex items-center justify-between rounded-md bg-success-soft px-3 py-1.5 text-sm">
                <span className="font-medium">{r.name}</span>
                {r.at && (
                  <span className="tabular text-xs text-muted-foreground">
                    {new Date(r.at).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
