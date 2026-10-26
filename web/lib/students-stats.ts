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
