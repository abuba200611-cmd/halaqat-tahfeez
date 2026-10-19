/*
  التوزيع الآلي بالسعة وقائمة الانتظار — منطق نقي بلا قاعدة بيانات (يُختبر مباشرة).
  القواعد:
  - الحلقة المرشَّحة = تطابق معاييرها (عمر، مستوى) ولها مقعد شاغر (السعة null = بلا حدّ).
  - الأفضل = الأقل طلاباً حالياً، وعند التعادل الأصغر معرّفاً.
  - معيار مقيِّد (نطاق عمر أو مستوى) لا يتحقق لمن لم يُدخل بياناته ← لا تطابق
    (يذهب للانتظار ويوزّعه المدير يدوياً) بدل تخمين قد يضع طالباً بحلقة غير مناسبة.
  - الترقية عند شغور مقعد: أول المنتظرين ترتيباً ممن يطابق معايير الحلقة التي شغر مقعدها.
*/

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: "مبتدئ",
  intermediate: "متوسط",
  advanced: "متقدم",
};

export const MAX_CAPACITY = 500;
export const MIN_AGE = 3;
export const MAX_AGE = 100;

export function isLevel(value: unknown): value is Level {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

/** حلقة كما تراها الخوارزمية: سعتها ومعاييرها وعدد طلابها الحاليين */
export type HalaqahSlot = {
  id: number;
  name: string;
  capacity: number | null;
  count: number;
  minAge: number | null;
  maxAge: number | null;
  level: Level | null;
};

/** ما يُطابَق به المسجِّل: سنة الميلاد والمستوى (كلاهما اختياري) */
export type Registrant = { birthYear: number | null; level: Level | null };

/** المقاعد الشاغرة، أو null = بلا حدّ */
export function seatsLeft(slot: Pick<HalaqahSlot, "capacity" | "count">): number | null {
  return slot.capacity === null ? null : Math.max(0, slot.capacity - slot.count);
}

export function hasFreeSeat(slot: Pick<HalaqahSlot, "capacity" | "count">): boolean {
  const left = seatsLeft(slot);
  return left === null || left > 0;
}

/** نسبة الإشغال 0..1 (قد تتجاوز 1 إن زاد المدير يدوياً)، أو null إن لم تُحدَّد سعة */
export function occupancyRatio(slot: Pick<HalaqahSlot, "capacity" | "count">): number | null {
  if (slot.capacity === null) return null;
  return slot.count / slot.capacity;
}

export function matchesCriteria(
  slot: Pick<HalaqahSlot, "minAge" | "maxAge" | "level">,
  registrant: Registrant,
  currentYear: number,
): boolean {
  if (slot.minAge !== null || slot.maxAge !== null) {
    if (registrant.birthYear === null) return false;
    const age = currentYear - registrant.birthYear;
    if (slot.minAge !== null && age < slot.minAge) return false;
    if (slot.maxAge !== null && age > slot.maxAge) return false;
  }
  if (slot.level !== null && registrant.level !== slot.level) return false;
  return true;
}

/** أنسب حلقة بمقعد شاغر: الأقل طلاباً ثم الأصغر معرّفاً، أو null ← انتظار */
export function pickHalaqah(slots: readonly HalaqahSlot[], registrant: Registrant, currentYear: number): HalaqahSlot | null {
  const candidates = slots.filter((slot) => hasFreeSeat(slot) && matchesCriteria(slot, registrant, currentYear));
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => a.count - b.count || a.id - b.id)[0];
}

// ————— قائمة الانتظار —————

export type WaitEntry = { id: number; order: number; registrant: Registrant };

/** ترتيب الانتظار: بالـorder ثم المعرّف (ثابت عند التساوي) */
export function sortWaitlist<T extends { id: number; order: number }>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.order - b.order || a.id - b.id);
}

/** ترتيب الدور (1-based) لكل تسجيل منتظر */
export function waitlistPositions(entries: readonly { id: number; order: number }[]): Map<number, number> {
  return new Map(sortWaitlist(entries).map((entry, index) => [entry.id, index + 1]));
}

/** الترتيب التالي لمن يدخل الانتظار الآن (في آخر القائمة) */
export function nextWaitlistOrder(entries: readonly { order: number }[]): number {
  return entries.reduce((max, entry) => Math.max(max, entry.order), 0) + 1;
}

/**
 * من يُرقّى لمقاعد حلقة شغرت؟ يمرّ على القائمة المرتّبة ويأخذ المطابقين لمعايير
 * الحلقة بترتيبهم حتى تمتلئ المقاعد الشاغرة. من لا يطابق يُتخطّى ولا يضيع دوره.
 */
export function selectPromotions(
  slot: HalaqahSlot,
  waitlist: readonly WaitEntry[],
  currentYear: number,
): WaitEntry[] {
  const seats = seatsLeft(slot);
  // بلا حدّ للسعة (مثلاً رفعها المدير) ← كل مطابق منتظر يُرقّى
  const left = seats === null ? Number.POSITIVE_INFINITY : seats;
  if (left <= 0) return [];
  const chosen: WaitEntry[] = [];
  for (const entry of sortWaitlist(waitlist)) {
    if (chosen.length >= left) break;
    if (matchesCriteria(slot, entry.registrant, currentYear)) chosen.push(entry);
  }
  return chosen;
}

/** تحريك تسجيل خطوة لأعلى/أسفل في ترتيب المعرّفات؛ null إن لم يكن موجوداً أو عند الحافة */
export function moveInWaitlist(orderedIds: readonly number[], id: number, direction: "up" | "down"): number[] | null {
  const index = orderedIds.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= orderedIds.length) return null;
  const next = [...orderedIds];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

// ————— التحقق من سعة الحلقة ومعاييرها —————

export type CriteriaInput = { capacity: number | null; minAge: number | null; maxAge: number | null; level: Level | null };
export type CriteriaResult = { ok: true; value: CriteriaInput } | { ok: false; error: string };

function optionalInt(raw: unknown, min: number, max: number, label: string): { value: number | null } | { error: string } {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  const num = typeof raw === "number" ? raw : typeof raw === "string" && /^[0-9]+$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(num) || num < min || num > max) return { error: `${label} يجب أن يكون رقماً صحيحاً بين ${min} و${max}` };
  return { value: num };
}

export function parseCriteria(input: Record<string, unknown>): CriteriaResult {
  const capacity = optionalInt(input.capacity, 1, MAX_CAPACITY, "السعة");
  if ("error" in capacity) return { ok: false, error: capacity.error };
  const minAge = optionalInt(input.minAge, MIN_AGE, MAX_AGE, "أقل عمر");
  if ("error" in minAge) return { ok: false, error: minAge.error };
  const maxAge = optionalInt(input.maxAge, MIN_AGE, MAX_AGE, "أكبر عمر");
  if ("error" in maxAge) return { ok: false, error: maxAge.error };
  if (minAge.value !== null && maxAge.value !== null && minAge.value > maxAge.value) {
    return { ok: false, error: "أقل عمر أكبر من أكبر عمر" };
  }
  const rawLevel = input.level;
  let level: Level | null = null;
  if (rawLevel !== null && rawLevel !== undefined && rawLevel !== "") {
    if (!isLevel(rawLevel)) return { ok: false, error: "المستوى غير صحيح" };
    level = rawLevel;
  }
  return { ok: true, value: { capacity: capacity.value, minAge: minAge.value, maxAge: maxAge.value, level } };
}

/** سنة الميلاد المقبولة: بين (السنة الحالية − 100) والسنة الحالية، أو null */
export function parseBirthYear(raw: unknown, currentYear: number): number | null | "invalid" {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = typeof raw === "number" ? raw : typeof raw === "string" && /^[0-9]{4}$/.test(raw.trim()) ? Number(raw.trim()) : NaN;
  if (!Number.isInteger(num) || num < currentYear - MAX_AGE || num > currentYear) return "invalid";
  return num;
}
