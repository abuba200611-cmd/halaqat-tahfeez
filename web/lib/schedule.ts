import { DEFAULT_SETTINGS, buildCandidates, selectPairs } from "./pairing";
import type { Pair, PairingSettings, Student } from "./types";

export const WEEKDAY_NAMES = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const;

export const MONTH_NAMES = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

/** أيام الحلقة الافتراضية: الأحد إلى الخميس */
export const DEFAULT_WEEKDAYS = [0, 1, 2, 3, 4];

export type ScheduleDay = {
  /** YYYY-MM-DD */
  date: string;
  dayNumber: number;
  weekdayName: string;
  pairs: Pair[];
  /** من لم يجد شريكاً مناسباً هذا اليوم — يسمّع للمعلّم */
  unmatched: Student[];
};

/** أرقام الشهر — لا تختلف بين الجدول المولّد والجدول المحفوظ */
type ScheduleTotals = {
  year: number;
  month: number;
  monthName: string;
  weekdays: number[];
  studentCount: number;
  sessionCount: number;
  candidateCount: number;
  elapsedMs: number;
  /** عدد الثنائيات المختلفة التي تكوّنت خلال الشهر */
  uniquePairs: number;
  /** أكثر عدد تكرّرت فيه ثنائية واحدة */
  maxRepeat: number;
};

export type MonthlySchedule = ScheduleTotals & {
  days: ScheduleDay[];
  /** كم مرة سمّع كل طالب للمعلّم — لمراجعة عدالة التوزيع */
  teacherTurns: { student: Student; times: number }[];
};

/** طالب داخل جدول محفوظ — اسمه يوم الاعتماد لا اسمه الحالي */
export type ScheduleStudent = {
  id: string;
  name: string;
};

export type SavedSchedulePair = {
  a: ScheduleStudent;
  b: ScheduleStudent;
  overlapJuz: number[];
};

export type SavedScheduleDay = {
  /** YYYY-MM-DD */
  date: string;
  dayNumber: number;
  weekdayName: string;
  pairs: SavedSchedulePair[];
  unmatched: ScheduleStudent[];
};

/**
 * الشكل الذي يُحفظ ويُعرض به الجدول. لا يحمل بيانات الطلاب كاملة:
 * الجدول يُقرأ بعد أن تتغيّر مقادير الحفظ والإتقان، والمقصود منه ما
 * عُلّق في الحلقة — الأسماء والثنائيات — لا نسخة من كل طالب في كل يوم.
 */
export type SavedSchedule = ScheduleTotals & {
  days: SavedScheduleDay[];
  teacherTurns: { student: ScheduleStudent; times: number }[];
};

/** سطر جدول محفوظ في القائمة — بلا محتواه */
export type SavedScheduleInfo = {
  id: number;
  year: number;
  month: number;
  weekdays: number[];
  /** وقت الاعتماد بتوقيت UTC: YYYY-MM-DD HH:MM:SS */
  createdAt: string;
};

export type SavedScheduleRecord = SavedScheduleInfo & { schedule: SavedSchedule };

function studentRef(student: Student): ScheduleStudent {
  return { id: student.id, name: student.name };
}

/** يجرّد الجدول من بيانات الطلاب الكاملة تمهيداً لحفظه */
export function toSavedSchedule(schedule: MonthlySchedule): SavedSchedule {
  return {
    ...schedule,
    days: schedule.days.map((day) => ({
      date: day.date,
      dayNumber: day.dayNumber,
      weekdayName: day.weekdayName,
      pairs: day.pairs.map((pair) => ({
        a: studentRef(pair.a),
        b: studentRef(pair.b),
        overlapJuz: pair.overlapJuz,
      })),
      unmatched: day.unmatched.map(studentRef),
    })),
    teacherTurns: schedule.teacherTurns.map(({ student, times }) => ({
      student: studentRef(student),
      times,
    })),
  };
}

/** مفتاح ثابت لثنائية بغضّ النظر عن الترتيب */
function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** أيام الشهر التي تنعقد فيها الحلقة */
export function sessionDaysOf(
  year: number,
  month: number,
  weekdays: number[],
): { dayNumber: number; weekday: number }[] {
  const out: { dayNumber: number; weekday: number }[] = [];
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const weekday = new Date(year, month - 1, d).getDay();
    if (weekdays.includes(weekday)) out.push({ dayNumber: d, weekday });
  }
  return out;
}

/**
 * يولّد جدول شهر كامل: لكل يوم حلقة ثنائيات تسميع، مع تدوير الشركاء
 * عبر الشهر وتناوب عادل على من يسمّع للمعلّم.
 *
 * المرشحون يُحسبون مرة واحدة قبل الحلقة لأن التقاطع بين أي طالبين لا يتغيّر
 * بتغيّر اليوم — المتغيّر هو سجل الشراكات فقط.
 */
export function generateMonthlySchedule(
  students: Student[],
  year: number,
  month: number,
  weekdays: number[] = DEFAULT_WEEKDAYS,
  settings: PairingSettings = DEFAULT_SETTINGS,
): MonthlySchedule {
  const started = performance.now();

  if (weekdays.length === 0) {
    throw new Error("اختر يوماً واحداً على الأقل من أيام الحلقة");
  }
  const { candidates, active } = buildCandidates(students, settings);
  if (active.length < 2) {
    throw new Error("تحتاج طالبين نشطين على الأقل لتوليد الجدول");
  }

  const pairCounts = new Map<string, number>();
  const aloneCounts = new Map<string, number>();
  const history = {
    timesPaired: (a: string, b: string) => pairCounts.get(pairKey(a, b)) ?? 0,
    timesAlone: (id: string) => aloneCounts.get(id) ?? 0,
  };

  const days: ScheduleDay[] = [];
  for (const { dayNumber, weekday } of sessionDaysOf(year, month, weekdays)) {
    const result = selectPairs(candidates, active, settings, history);

    for (const pair of result.pairs) {
      const key = pairKey(pair.a.id, pair.b.id);
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
    for (const student of result.unmatched) {
      aloneCounts.set(student.id, (aloneCounts.get(student.id) ?? 0) + 1);
    }

    days.push({
      date: `${year}-${pad2(month)}-${pad2(dayNumber)}`,
      dayNumber,
      weekdayName: WEEKDAY_NAMES[weekday],
      pairs: result.pairs,
      unmatched: result.unmatched,
    });
  }

  const byId = new Map(active.map((s) => [s.id, s]));
  const teacherTurns = [...aloneCounts.entries()]
    .map(([id, times]) => ({ student: byId.get(id)!, times }))
    .filter((row) => row.student)
    .sort((x, y) => y.times - x.times);

  return {
    year,
    month,
    monthName: MONTH_NAMES[month - 1],
    weekdays,
    studentCount: active.length,
    sessionCount: days.length,
    candidateCount: candidates.length,
    elapsedMs: Math.round(performance.now() - started),
    days,
    uniquePairs: pairCounts.size,
    maxRepeat: pairCounts.size === 0 ? 0 : Math.max(...pairCounts.values()),
    teacherTurns,
  };
}
