"use client";

import { useEffect, useState } from "react";

/*
  جلب مشترك بعنوان واحد: كل نسخ المكوّن المركّبة بنفس الصفحة (وسم بالسايدبار
  + وسم بالشريط العلوي + مبدّل الأدوار بالدرج الجوّال…) تتشارك طلباً واحداً
  لا يُطلَب إلا مرة لأول مشترك، مع مؤقّت تكرار واحد لأطول فترة بقاء مركّبة.
  الوسوم كانت تُجلب ٢–٣ مرات بالصفحة لأن هيكل المعلّم يركّب السايدبار مرتين
  (ديسكتوب + درج جوّال) — بلا أي مكتبة جديدة.

  الكشف ذو حالة داخلية واحدة لكل عنوان: data آخر استجابة ناجحة (تبقى
  عند فشل الشبكة)، version يرتفع بكل اكتمال جلب فيعيد إعلام المشتركين،
  وinflight يمنع الطلب المتزامن المزدوج (StrictMode: تركيب/فك/تركيب =
  طلب واحد).
*/

type Entry = {
  data: unknown;
  version: number;
  listeners: Set<() => void>;
  timer: ReturnType<typeof setInterval> | null;
  inflight: Promise<void> | null;
};

const entries = new Map<string, Entry>();

function entryFor(url: string): Entry {
  let entry = entries.get(url);
  if (!entry) {
    entry = { data: null, version: 0, listeners: new Set(), timer: null, inflight: null };
    entries.set(url, entry);
  }
  return entry;
}

function load(url: string, entry: Entry): Promise<void> {
  if (entry.inflight) return entry.inflight;
  entry.inflight = (async () => {
    try {
      const res = await fetch(url);
      if (res.ok) entry.data = await res.json();
      // فشل/غير ناجح: نبقي آخر بيانات — الوسوم تعرض آخر قيمة معروفة
    } catch {
      // فشل شبكة — كذلك نبقي آخر بيانات
    } finally {
      entry.inflight = null;
    }
    entry.version += 1;
    for (const listener of entry.listeners) listener();
  })();
  return entry.inflight;
}

/**
 * JSON مشترك لعنوان واحد: قيمة واحدة لكل المكوّنات المركّبة، وجلب جديد
 * عند أول اشتراك بعد خلو الكشف (التنقل لصفحة جديدة). pollMs > 0 يبقي
 * تحديثاً دورياً واحداً ما دام أي مشترك مركّباً.
 */
export function useSharedJson<T>(url: string, pollMs = 0): T | null {
  // حالة محلية فقط لدفع إعادة العرض — القيمة تُقرأ من الكشف المشترك
  const [, bump] = useState(0);

  useEffect(() => {
    const entry = entryFor(url);
    const notify = () => bump((v) => v + 1);
    const firstSubscriber = entry.listeners.size === 0;
    entry.listeners.add(notify);
    if (firstSubscriber) void load(url, entry);
    else notify(); // بيانات الكشف قد تحدّثت قبل اشتراكنا
    if (pollMs > 0 && entry.timer === null) {
      entry.timer = setInterval(() => void load(url, entry), pollMs);
    }
    return () => {
      entry.listeners.delete(notify);
      if (entry.listeners.size === 0) {
        if (entry.timer !== null) {
          clearInterval(entry.timer);
          entry.timer = null;
        }
        // آخر مشترك غادر (خروج/تبديل دور): لا تبقَ بيانات مستخدم سابق للقادم
        entry.data = null;
      }
    };
  }, [url, pollMs]);

  return (entries.get(url)?.data as T | null) ?? null;
}
