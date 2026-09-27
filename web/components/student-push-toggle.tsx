"use client";

import { useEffect, useState } from "react";

/** يحوّل مفتاح VAPID العام (base64url) إلى Uint8Array كما يتطلّبه pushManager — نفس دالة components/push-toggle.tsx (المعلّم) */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type State = "unsupported" | "ios-add-to-home" | "off" | "on" | "busy" | "denied";

/** هل المتصفّح Safari على iOS؟ (لا "PushManager" هناك إلا بعد إضافة الموقع للشاشة الرئيسية وتشغيله كتطبيق مستقل) */
function isIOSSafariNotStandalone(): boolean {
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return isIOS && !standalone;
}

/**
 * زرّ "تفعيل التذكير اليومي" على جهاز الطالب (STEP 54) — نفس عامل
 * الخدمة (public/sw.js) ونفس بنية الاشتراك المستخدمة لدى المعلّم
 * (components/push-toggle.tsx)، بمساراتها الخاصة بالطالب فقط.
 */
export function StudentPushToggle() {
  const [state, setState] = useState<State>("busy");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState(isIOSSafariNotStandalone() ? "ios-add-to-home" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setState(sub ? "on" : "off");
      } catch {
        if (!cancelled) setState("off");
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setError(null);
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const keyRes = await fetch("/api/student/push/subscribe");
      if (!keyRes.ok) throw new Error("الإشعارات غير متاحة على الخادم");
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch("/api/student/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("تعذّر حفظ الاشتراك");
      setState("on");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تفعيل الإشعارات");
      setState("off");
    }
  }

  async function disable() {
    setError(null);
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await fetch("/api/student/push/unsubscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  if (state === "ios-add-to-home") {
    return (
      <p className="text-xs text-slate-500">
        📱 على آيفون: أضف هذا الموقع للشاشة الرئيسية أولاً (زر المشاركة ← «أضف إلى الشاشة الرئيسية»)، ثم افتحه من هناك لتفعيل التذكير.
      </p>
    );
  }
  if (state === "unsupported") {
    return <p className="text-xs text-slate-500">هذا المتصفّح لا يدعم الإشعارات.</p>;
  }
  if (state === "denied") {
    return <p className="text-xs text-red-600">الإشعارات محظورة في إعدادات المتصفّح — فعّلها من إعدادات الموقع.</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on" ? (
        <>
          <span className="text-xs text-emerald-600">تذكير الورد اليومي مفعّل على هذا الجهاز ✓</span>
          <button
            type="button"
            onClick={disable}
            className="cursor-pointer text-xs font-semibold text-slate-500 underline hover:no-underline"
          >
            إيقاف
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={enable}
          disabled={state === "busy"}
          className="cursor-pointer rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {state === "busy" ? "لحظة…" : "🔔 تفعيل التذكير اليومي"}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
