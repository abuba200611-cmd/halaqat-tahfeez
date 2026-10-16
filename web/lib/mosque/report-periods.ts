/*
  حساب فترات التقارير البحتة (بلا قاعدة بيانات ولا "server-only") —
  الأسابيع تبدأ السبت (عرف سعودي، مثل التقييم)، والشهر الهجري يُحسب
  بتقويم أم القرى عبر Intl: نجد أجزاء تاريخ اليوم الهجرية ثم نمسح
  حوالي اليوم للخلف حتى أول الشهر وللأمام حتى آخره.
*/

import { formatWeek, parseWeekStart, saturdayOf } from "./evaluation";

const DAY_MS = 86_400_000;

export type PeriodChoice = "this_week" | "last_week" | "hijri_month" | "custom";
export type ReportPeriod = { from: string; to: string };

export const PERIOD_CHOICES: readonly { value: PeriodChoice; label: string }[] = [
  { value: "this_week", label: "هذا الأسبوع" },
  { value: "last_week", label: "الأسبوع الماضي" },
  { value: "hijri_month", label: "هذا الشهر الهجري" },
  { value: "custom", label: "نطاق مخصص" },
];

export function isPeriodChoice(value: unknown): value is PeriodChoice {
  return PERIOD_CHOICES.some((choice) => choice.value === value);
}

/** أجزاء التاريخ الهجري (أم القرى) بتوقيت عالمي حسمياً — {سنة، شهر، يوم} */
export function hijriParts(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    timeZone: "UTC",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** نطاق الشهر الهجري الذي يقع فيه اليوم (مواعيده ميلادية YYYY-MM-DD) */
export function hijriMonthRange(today: Date): ReportPeriod {
  const target = hijriParts(today);

  let start = new Date(today.getTime());
  let prev = hijriParts(addDays(start, -1));
  while (prev.year === target.year && prev.month === target.month) {
    start = addDays(start, -1);
    prev = hijriParts(addDays(start, -1));
  }

  let end = new Date(today.getTime());
  let next = hijriParts(addDays(end, 1));
  while (next.year === target.year && next.month === target.month) {
    end = addDays(end, 1);
    next = hijriParts(addDays(end, 1));
  }
  return { from: formatWeek(start), to: formatWeek(end) };
}

/** اسم الشهر الهجري بسنينته — «ربيع الآخر 1448هـ» */
export function hijriMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** نطاق الأسبوع الجاري (سبت→جمعة) — دائماً صالح، لمن يحتاج فترة بلا null */
export function currentWeekPeriod(today = new Date()): ReportPeriod {
  const base = saturdayOf(today);
  return { from: formatWeek(base), to: formatWeek(addDays(base, 6)) };
}

/**
 * فترة التقرير حسب اختيار المستخدم — null لو الاختيار مجهول أو نطاق
 * custom ناقص/معكوس. كل التواريخ YYYY-MM-DD بأجزاء UTC حسمياً.
 */
export function resolvePeriod(
  choice: PeriodChoice,
  custom: { from?: unknown; to?: unknown } = {},
  today = new Date(),
): ReportPeriod | null {
  const base = saturdayOf(today);
  if (choice === "this_week") {
    return { from: formatWeek(base), to: formatWeek(addDays(base, 6)) };
  }
  if (choice === "last_week") {
    return { from: formatWeek(addDays(base, -7)), to: formatWeek(addDays(base, -1)) };
  }
  if (choice === "hijri_month") {
    return hijriMonthRange(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  }

  const from = parseWeekStart(typeof custom.from === "string" ? custom.from : "");
  const to = parseWeekStart(typeof custom.to === "string" ? custom.to : "");
  if (!from || !to || from > to) return null;
  return { from: formatWeek(from), to: formatWeek(to) };
}

/** «10 أكتوبر – 16 أكتوبر 2026» — عنوان الفترة بالتقويم الميلادي */
export function periodLabel(period: ReportPeriod): string {
  const from = parseWeekStart(period.from);
  const to = parseWeekStart(period.to);
  if (!from || !to) return `${period.from} – ${period.to}`;
  const fmt = (date: Date, withYear: boolean) =>
    new Intl.DateTimeFormat("ar-SA-u-ca-gregory", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(date);
  return from.getUTCFullYear() === to.getUTCFullYear()
    ? `${fmt(from, false)} – ${fmt(to, true)}`
    : `${fmt(from, true)} – ${fmt(to, true)}`;
}
