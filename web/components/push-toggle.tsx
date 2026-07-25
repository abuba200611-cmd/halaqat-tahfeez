"use client";

import { useEffect, useState } from "react";
import { Button } from "./ui";

/** يحوّل مفتاح VAPID العام (base64url) إلى Uint8Array كما يتطلّبه pushManager */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

type State = "unsupported" | "off" | "on" | "busy" | "denied";

/**
 * زرّ تفعيل إشعارات الوارد على جهاز المعلّم: يسجّل عامل الخدمة، يطلب الإذن،
 * يشترك عبر مفتاح VAPID، ويحفظ الاشتراك على الخادم.
 */
export function PushToggle() {
  const [state, setState] = useState<State>("busy");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window)
      ) {
        if (!cancelled) setState("unsupported");
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

      const keyRes = await fetch("/api/push");
      if (!keyRes.ok) throw new Error("الإشعارات غير متاحة على الخادم");
      const { publicKey } = (await keyRes.json()) as { publicKey: string };

      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const res = await fetch("/api/push", {
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
        await fetch("/api/push", {
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

  if (state === "unsupported") {
    return <p className="text-xs text-muted-foreground">هذا المتصفّح لا يدعم الإشعارات.</p>;
  }
  if (state === "denied") {
    return (
      <p className="text-xs text-destructive">
        الإشعارات محظورة في إعدادات المتصفّح — فعّلها من إعدادات الموقع.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {state === "on" ? (
        <>
          <span className="text-xs text-success">الإشعارات مفعّلة على هذا الجهاز ✓</span>
          <Button variant="ghost" onClick={disable} className="text-xs">
            إيقاف
          </Button>
        </>
      ) : (
        <Button variant="ghost" onClick={enable} disabled={state === "busy"} className="text-xs">
          {state === "busy" ? "لحظة…" : "تفعيل الإشعارات على هذا الجهاز"}
        </Button>
      )}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
