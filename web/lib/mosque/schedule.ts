/*
  مساعدات الجدول الأسبوعي البحتة (بلا قاعدة بيانات ولا "server-only")
  — معجم الأيام والفترات وأنواع البرامج وتحقق الوقت، يشترك فيه المسار
  وصفحتا الجدول (الإدارة والعامة).
*/

import type { ProgramKind, SchedulePeriod } from "./db";

/** أيام الأسبوع السعودي: 0=السبت .. 6=الجمعة */
export const WEEK_DAYS: readonly { value: number; label: string }[] = [
  { value: 0, label: "السبت" },
  { value: 1, label: "الأحد" },
  { value: 2, label: "الاثنين" },
  { value: 3, label: "الثلاثاء" },
  { value: 4, label: "الأربعاء" },
  { value: 5, label: "الخميس" },
  { value: 6, label: "الجمعة" },
];

export const dayLabel = (day: number) => WEEK_DAYS[day]?.label ?? String(day);

/** فترات اليوم بترتيبها — "other" آخرها للمواعيد الخاصة */
export const PERIODS: readonly { value: SchedulePeriod; label: string }[] = [
  { value: "fajr", label: "الفجر" },
  { value: "dhuhr", label: "الظهر" },
  { value: "asr", label: "العصر" },
  { value: "maghrib", label: "المغرب" },
  { value: "isha", label: "العشاء" },
  { value: "other", label: "أخرى" },
];

export const periodLabel = (period: string) => PERIODS.find((p) => p.value === period)?.label ?? period;

export const PROGRAM_KINDS: readonly { value: ProgramKind; label: string }[] = [
  { value: "halaqah", label: "حلقة" },
  { value: "family", label: "برنامج أسرة" },
  { value: "committee", label: "لجنة" },
  { value: "lecture", label: "محاضرة" },
  { value: "sport", label: "رياضة" },
  { value: "cultural", label: "ثقافي" },
  { value: "other", label: "أخرى" },
];

export const programKindLabel = (kind: string) => PROGRAM_KINDS.find((k) => k.value === kind)?.label ?? kind;

/** أنواع البرامج التي يجب أن يشير ref_id فيها إلى كيان من الجامع نفسه */
export const REF_KINDS: readonly ProgramKind[] = ["halaqah", "family", "committee"];

export function isSchedulePeriod(value: unknown): value is SchedulePeriod {
  return PERIODS.some((p) => p.value === value);
}

export function isProgramKind(value: unknown): value is ProgramKind {
  return PROGRAM_KINDS.some((k) => k.value === value);
}

/** وقت بصيغة HH:MM ضمن المجال الصالح، أو null (نقبله أيضاً فارغاً = بلا وقت) */
export function parseTimeString(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value) ? value : null;
}

/** الوقت الصالح كما كتبه المستخدم — String(...) للفحص، أو null */
export function normalizeTimeInput(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value).trim();
}

export type SlotInput = {
  dayOfWeek: number;
  period: SchedulePeriod;
  startTime: string | null;
  title: string;
  programKind: ProgramKind;
  refId: number | null;
  location: string | null;
  notes: string | null;
};

function trimTo(value: unknown, maxLength: number): string {
  return String(value ?? "").trim().slice(0, maxLength);
}

/**
 * مدقق خانة الجدول من جسم الطلب (نقي — الفحص غير المتزامن لانتماء ref_id
 * للجامع يبقى بالمسار). يعيد {error} أو {slot} صالحاً للإضافة/التعديل.
 */
export function parseSlotBody(body: unknown): { slot?: SlotInput; error?: string } {
  const raw = (body ?? {}) as Record<string, unknown>;

  const day = Number(raw.dayOfWeek);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return { error: "اليوم يجب أن يكون رقماً بين 0 (السبت) و6 (الجمعة)" };
  }
  if (!isSchedulePeriod(raw.period)) return { error: "فترة اليوم غير معروفة" };

  const timeRaw = normalizeTimeInput(raw.startTime);
  const startTime = timeRaw === null || timeRaw === "" ? null : parseTimeString(timeRaw);
  if (timeRaw !== null && timeRaw !== "" && startTime === null) {
    return { error: "وقت البداية يجب أن يكون بصيغة HH:MM (مثل 17:30)" };
  }

  const title = trimTo(raw.title, 200);
  if (!title) return { error: "عنوان الخانة مطلوب" };

  const programKind = raw.programKind === undefined ? "other" : raw.programKind;
  if (!isProgramKind(programKind)) return { error: "نوع البرنامج غير معروف" };

  let refId: number | null = null;
  if (raw.refId !== undefined && raw.refId !== null && raw.refId !== "") {
    const parsed = Number(raw.refId);
    if (!Number.isInteger(parsed) || parsed < 1) return { error: "refId يجب أن يكون رقماً موجباً" };
    refId = parsed;
  }
  if (refId !== null && !REF_KINDS.includes(programKind)) {
    return { error: "الربط بكيان لا يصح إلا لبرامج الحلقات والأسر واللجان" };
  }

  const location = trimTo(raw.location, 200);
  const notes = trimTo(raw.notes, 1000);
  return {
    slot: { dayOfWeek: day, period: raw.period, startTime, title, programKind, refId, location: location || null, notes: notes || null },
  };
}
