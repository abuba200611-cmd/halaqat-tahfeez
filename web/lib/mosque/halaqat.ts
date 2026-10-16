import "server-only";

import { randomBytes } from "node:crypto";
import { listStudents, upsertStudent } from "@/lib/db";
import { parseMetricsRange, type HalaqahMetrics } from "@/lib/metrics";
import { getHalaqahMetrics } from "@/lib/metrics-db";
import { pageCount } from "@/lib/pairing";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import type { Halaqah } from "./db";

/*
  بيانات الحلقات لنظام الجامع — استدعاءات مباشرة داخل العملية على قاعدة
  الحلقات نفسها (تحلّ محل نداءات خادم لخادم /api/link/* بين التطبيقين
  سابقاً). الحلقة تُحدَّد بمعرّفها الحقيقي halaqahs.id، والمسار الذي
  يستدعي هذه الدوال مسؤول عن التحقق أن الحلقة تتبع الجامع المصرَّح له
  (halaqahs.mosque_id) قبل الاستدعاء — هذه الدوال لا تفحص الصلاحية.
  ملاحظة تسمية: `teacher_id` في جداول الطلاب هو معرّف الحلقة (halaqahs.id).
*/

export type HalaqahStats = { activeStudents: number; totalPages: number; avgPages: number; avgMastery: number };

/** إحصائيات حلقة (طلاب نشطون، محفوظ، إتقان) — نفس حسابات /api/link/stats */
export async function getHalaqahStats(halaqahId: number): Promise<HalaqahStats> {
  const students = (await listStudents(halaqahId)).filter((s) => s.active);

  const totalPages = students.reduce((sum, s) => sum + pageCount(s), 0);
  const avgPages = students.length ? Math.round(totalPages / students.length) : 0;

  const masteryValues = students.flatMap((s) => Object.values(s.mastery));
  const avgMastery = masteryValues.length
    ? Math.round(masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length)
    : 0;

  return { activeStudents: students.length, totalPages, avgPages, avgMastery };
}

export type RosterStudent = {
  /** معرّف الطالب الحقيقي (students.id) — أساس ربط لوحة الشرف والدماغ بلا مطابقة بالاسم */
  id: string;
  name: string;
  group: string;
  pages: number;
  avgMastery: number;
  active: boolean;
};
export type Roster = { teacherName: string; halaqahName: string; students: RosterStudent[] };

/** قائمة طلاب الحلقة بالاسم — نفس حسابات /api/link/roster مع معرّف الطالب */
export async function getHalaqahRoster(halaqah: Pick<Halaqah, "id" | "halaqahName" | "teacherName">): Promise<Roster> {
  const students = await listStudents(halaqah.id);
  return {
    teacherName: halaqah.teacherName,
    halaqahName: halaqah.halaqahName,
    students: students.map((s) => {
      const masteryValues = Object.values(s.mastery);
      return {
        id: s.id,
        name: s.name,
        group: s.group,
        pages: pageCount(s),
        avgMastery: masteryValues.length
          ? Math.round(masteryValues.reduce((a, b) => a + b, 0) / masteryValues.length)
          : 0,
        active: s.active,
      };
    }),
  };
}

/** مقاييس حلقة لفترة (حضور، أوراد، خطة، تلاوات، درجة تفاعل) من lib/metrics-db مباشرة */
export async function getMetricsForHalaqah(
  halaqah: Pick<Halaqah, "id" | "halaqahName" | "teacherName">,
  from: string,
  to: string,
): Promise<HalaqahMetrics | null> {
  const today = riyadhTodayISO();
  // نفس تحقق /api/link/metrics (صيغة التاريخ + حدّ ١٢٠ يوماً) — نطاق غير صالح = غير متاح
  const range = parseMetricsRange(from, to, today);
  if (!range.ok) return null;
  return getHalaqahMetrics(
    { id: halaqah.id, halaqahName: halaqah.halaqahName, teacherName: halaqah.teacherName },
    { from: range.from, to: range.to },
    today,
  );
}

/** يضيف طالباً فعلياً لقائمة الحلقة (نفس إنشاء /api/link/add-student) ويرجع معرّفه */
export async function addStudentToHalaqah(halaqahId: number, studentName: string): Promise<string> {
  const studentId = randomBytes(12).toString("hex");
  await upsertStudent(halaqahId, {
    id: studentId,
    name: studentName,
    group: "",
    ranges: [],
    mastery: {},
    active: true,
    rating: 0,
  });
  return studentId;
}
