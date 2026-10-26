/*
  إحصائيات صفحة الطلاب — منطق نقي (بلا React) يُختبر مباشرة: المجاميع
  العلوية للوحة (عدد، متوسط حضور، متوسط إتقان، رسوم مستحقة).
*/

import type { AttendanceSummary } from "./attendance";
import type { FeeStatus } from "./fees";
import type { Student } from "./types";

/** متوسط إتقان الطالب = متوسط درجات أجزائه مقرَّباً، و٠ لطالب بلا أجزاء محفوظة */
export function avgMastery(student: Student): number {
  const vals = Object.values(student.mastery);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export type StudentStatsInput = {
  students: Student[];
  attendance: Record<string, AttendanceSummary>;
  /** null = ميزة الرسوم مطفأة للحلقة فتُخفى بطاقتها كلياً */
  fees: Record<string, { status: FeeStatus }> | null;
};

export type StudentStats = {
  total: number;
  /** متوسط presentPct لمن له ملخص حضور (غير null) خلال آخر ٣٠ يوماً — null بلا أحد */
  avgAttendance: number | null;
  /** متوسط متوسطات الإتقان، بلا من لا أجزاء له — null بلا أحد */
  avgMastery: number | null;
  /** عدد من حالته due أو partial — null إن كانت الرسوم مطفأة */
  feesOutstanding: number | null;
};

/** بطاقات الإحصاء أعلى صفحة الطلاب — كل متوسط مقرَّب، وnull يعني «لا بيانات» */
export function computeStudentStats({ students, attendance, fees }: StudentStatsInput): StudentStats {
  const attendancePcts: number[] = [];
  const masteries: number[] = [];
  for (const student of students) {
    const pct = attendance[student.id]?.presentPct;
    if (pct != null) attendancePcts.push(pct);
    const vals = Object.values(student.mastery);
    if (vals.length > 0) masteries.push(Math.round(vals.reduce((a, b) => a + b, 0) / vals.length));
  }

  const mean = (list: number[]) => Math.round(list.reduce((a, b) => a + b, 0) / list.length);

  return {
    total: students.length,
    avgAttendance: attendancePcts.length > 0 ? mean(attendancePcts) : null,
    avgMastery: masteries.length > 0 ? mean(masteries) : null,
    feesOutstanding:
      fees === null
        ? null
        : students.filter((s) => {
            const status = fees[s.id]?.status;
            return status === "due" || status === "partial";
          }).length,
  };
}

/* ——— تشكيل بيانات رسوم لوحة الطلاب (دوال نقية) ——— */

export type MasteryBucketKey = "excellent" | "veryGood" | "good" | "needsFollowUp";

export type MasteryBucket = {
  key: MasteryBucketKey;
  label: string;
  count: number;
  /** نسبة الشريحة من الإجمالي مقرَّبة (٠ حين الإجمالي ٠) */
  pct: number;
};

const MASTERY_BUCKETS: { key: MasteryBucketKey; label: string; test: (m: number) => boolean }[] = [
  { key: "excellent", label: "ممتاز", test: (m) => m >= 90 },
  { key: "veryGood", label: "جيد جداً", test: (m) => m >= 75 && m < 90 },
  { key: "good", label: "جيد", test: (m) => m >= 55 && m < 75 },
  { key: "needsFollowUp", label: "يحتاج متابعة", test: (m) => m < 55 },
];

/** توزيع الطلاب على شرائح الإتقان؛ من لا أجزاء محفوظة له لا يُحتسب (لا بيانات ≠ ضعف) */
export function masteryDistribution(students: Student[]): { total: number; buckets: MasteryBucket[] } {
  const withData = students.filter((s) => Object.keys(s.mastery).length > 0);
  const total = withData.length;
  const buckets = MASTERY_BUCKETS.map(({ key, label, test }) => {
    const count = withData.filter((s) => test(avgMastery(s))).length;
    return { key, label, count, pct: total === 0 ? 0 : Math.round((count / total) * 100) };
  });
  return { total, buckets };
}

export type AttendanceTotals = { present: number; late: number; excused: number; absent: number };

/** مجاميع الحضور لكل الطلاب خلال النافذة (حاضر/متأخر/مستأذن/غائب) */
export function attendanceTotals(attendance: Record<string, AttendanceSummary>): AttendanceTotals {
  const totals: AttendanceTotals = { present: 0, late: 0, excused: 0, absent: 0 };
  for (const s of Object.values(attendance)) {
    totals.present += s.present;
    totals.late += s.late;
    totals.excused += s.excused;
    totals.absent += s.absent;
  }
  return totals;
}

export type FeeBucket = { status: FeeStatus; count: number; pct: number };

/** عدد الطلاب لكل حالة رسوم؛ من لا سجلّ له يُستبعد. الترتيب: مدفوع، جزئي، مستحق، معفى */
export function feeBreakdown(
  students: Student[],
  fees: Record<string, { status: FeeStatus }>,
): { total: number; buckets: FeeBucket[] } {
  const order: FeeStatus[] = ["paid", "partial", "due", "waived"];
  const counts: Record<FeeStatus, number> = { paid: 0, partial: 0, due: 0, waived: 0 };
  for (const s of students) {
    const status = fees[s.id]?.status;
    if (status) counts[status] += 1;
  }
  const total = order.reduce((sum, st) => sum + counts[st], 0);
  return {
    total,
    buckets: order.map((status) => ({
      status,
      count: counts[status],
      pct: total === 0 ? 0 : Math.round((counts[status] / total) * 100),
    })),
  };
}

export type TopStudent = { id: string; name: string; group: string; mastery: number };

/** أعلى n طلاب إتقاناً (من لهم أجزاء فقط)، وعند التساوي بترتيب الاسم لثبات الترتيب */
export function topStudents(students: Student[], n: number): TopStudent[] {
  return students
    .filter((s) => Object.keys(s.mastery).length > 0)
    .map((s) => ({ id: s.id, name: s.name, group: s.group, mastery: avgMastery(s) }))
    .sort((a, b) => b.mastery - a.mastery || a.name.localeCompare(b.name, "ar"))
    .slice(0, Math.max(0, n));
}

/** عدد الطلاب المتقنين (متوسط إتقانهم ≥ ٧٥٪) */
export function masteredCount(students: Student[]): number {
  return students.filter((s) => Object.keys(s.mastery).length > 0 && avgMastery(s) >= 75).length;
}
