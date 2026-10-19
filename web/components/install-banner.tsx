"use client";

import { useEffect, useState } from "react";
import { INSTALL_DISMISSED_KEY, INSTALL_VISITS_KEY, installBannerMode, type InstallPlatform } from "@/lib/pwa";

/* حدث beforeinstallprompt غير معرّف في lib.dom */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const SESSION_COUNTED_KEY = "mos_pwa_counted";

function readVisits(): number {
  try {
    const n = Number(localStorage.getItem(INSTALL_VISITS_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** يحسب زيارة واحدة لكل جلسة تبويب */
function countVisit(): number {
  try {
    if (sessionStorage.getItem(SESSION_COUNTED_KEY) === "1") return readVisits();
    sessionStorage.setItem(SESSION_COUNTED_KEY, "1");
    const next = readVisits() + 1;
    localStorage.setItem(INSTALL_VISITS_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

/* لافتة «ثبّت التطبيق» الصغيرة — تظهر في اللوحات بعد الزيارة الثانية ويُحفظ إغلاقها. */
export function InstallBanner() {
  const [mode, setMode] = useState<InstallPlatform>("none");
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const visits = countVisit();
    const ua = navigator.userAgent;
    const evaluate = (prompt: InstallPromptEvent | null) =>
      setMode(installBannerMode({ visits, dismissed: readDismissed(), standalone: isStandalone(), hasPrompt: prompt !== null, ua }));

    evaluate(null);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const prompt = e as InstallPromptEvent;
      setDeferred(prompt);
      evaluate(prompt);
    };
    const onInstalled = () => {
      setDeferred(null);
      setMode("none");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    setMode("none");
    try {
      localStorage.setItem(INSTALL_DISMISSED_KEY, "1");
    } catch {
      /* التخزين غير متاح: تُغلق لهذه الجلسة فقط */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => null);
    setDeferred(null);
    setMode("none");
  };

  if (mode === "none") return null;

  return (
    <div
      role="region"
      aria-label="تثبيت التطبيق"
      className="mb-4 flex items-start gap-3 rounded-2xl border border-border-strong bg-surface p-3.5 text-sm text-foreground shadow-sm"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">ثبّت تطبيق السلام</p>
        {mode === "android" ? (
          <p className="mt-0.5 text-muted-foreground">افتحه من شاشتك الرئيسية مباشرة، كأي تطبيق.</p>
        ) : (
          <p className="mt-0.5 text-muted-foreground">اضغط زر «شارك» في سفاري ← ثم «أضف إلى الشاشة الرئيسية».</p>
        )}
        {mode === "android" && (
          <button
            type="button"
            onClick={install}
            className="mt-2 cursor-pointer rounded-xl bg-primary px-4 py-1.5 text-sm font-semibold text-on-primary transition-colors hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            ثبّت التطبيق
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="إغلاق"
        className="shrink-0 cursor-pointer rounded-lg px-2 py-1 text-lg leading-none text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        ×
      </button>
    </div>
  );
}
