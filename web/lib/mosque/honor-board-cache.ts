/*
  كشف لوحة الشرف داخل الذاكرة: النتيجة تُحسب من نداءات متوازية لنظام
  المعلّم واستعلامات القاعدة، فتُخزَّن لكل (جامع، فترة محلولة) مدة قصيرة —
  الفترة بالمفتاح هي from/to المحلولان حتى تنقضي الذاكرة تلقائياً عند
  انقلاب الأسبوع، وحدّ أعلنى للمداخل كي لا تنمو بلا سقف.
*/

export const HONOR_BOARD_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 100;

type Entry = { value: unknown; storedAt: number };
const store = new Map<string, Entry>();

/** مفتاح الكشف: جامع + نطاق الفترة المحلول (YYYY-MM-DD) */
export function honorBoardCacheKey(mosqueId: number, from: string, to: string): string {
  return `${mosqueId}:${from}:${to}`;
}

/** القيمة المخزونة ما لم تنقضِ مدتها — null لو غائبة أو منتهية */
export function readHonorBoardCache<T>(key: string, now = Date.now()): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (now - entry.storedAt >= HONOR_BOARD_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry.value as T;
}

export function storeHonorBoardCache(key: string, value: unknown, now = Date.now()): void {
  store.delete(key); // إعادة إدراج بترتيب أحدث استخدام
  store.set(key, { value, storedAt: now });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** إفراغ كامل — للاختبارات فقط */
export function clearHonorBoardCache(): void {
  store.clear();
}
