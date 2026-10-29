import "server-only";

import { db } from "./db";
import { riyadhTodayISO } from "./riyadh-date";
import {
  addDaysISO,
  fillDailySeries,
  safePct,
  topNWithOther,
  weeklyBuckets,
  weekStartISO,
  type CategoryPoint,
  type DailyPoint,
} from "./chart-series";
import { masteryDistribution, type MasteryBucket } from "./students-stats";
import type { Student } from "./types";

/*
  مواصفة 003 — استعلامات تجميع رسوم اللوحات (قراءة فقط، لا مايقريشن).
  الأيام نصوص YYYY-MM-DD محسوبة بتوقيت الرياض (riyadhTodayISO) وتُقارن
  نصّياً مثل باقي استعلامات ward_logs/attendance (أعمدة date مخزَّنة محلياً).
  لوحتا المطوّر والجمعية لا تُرجعان إلا أرقاماً مجمّعة — لا أسماء طلاب
  ولا أولياء أمور (مبدأ الخصوصية II).
*/

/** نافذة الرسم اليومي (أوراد/حضور) — ثابت قابل للتعديل (افتراضات المواصفة) */
export const WARDS_WINDOW_DAYS = 30;
/** أسابيع رسم الطلاب الجدد */
export const NEW_STUDENTS_WEEKS = 12;
/** أقصى عدد تسميات برسم المقارنة قبل تجميع الباقي في «أخرى» */
const TOP_N = 10;
const OTHER_LABEL = "أخرى";

/** يوم n-m في النافذة (شاملة الطرفين): from = today − (n−1) */
function windowFrom(today: string, days: number): string {
  return addDaysISO(today, -(days - 1));
}

/** سلسلة أوراد يومية كثيفة لحلقة واحدة (halaqahId = halaqahs.id = students.teacher_id) */
export async function wardsDailyFor(halaqahId: number, today = riyadhTodayISO()): Promise<DailyPoint[]> {
  const from = windowFrom(today, WARDS_WINDOW_DAYS);
  const rows = await db().sql`
    SELECT date, COUNT(*)::int AS value
    FROM ward_logs
    WHERE teacher_id = ${halaqahId} AND date >= ${from} AND date <= ${today}
    GROUP BY date
  `;
  return fillDailySeries(rows.map((r) => ({ date: r.date as string, value: Number(r.value ?? 0) })), from, today);
}

/**
 * سلسلة أوراد يومية لطالب واحد (لوحة الطالب) — آخر ٣٠ يوماً بكل حالات
 * الورد، أرقام مجمّعة فقط تُضاف لمسار /api/wards/mine القائم.
 */
export async function studentWardsDaily(
  teacherId: number,
  studentId: string,
  today = riyadhTodayISO(),
): Promise<DailyPoint[]> {
  const from = windowFrom(today, WARDS_WINDOW_DAYS);
  const rows = await db().sql`
    SELECT date, COUNT(*)::int AS value
    FROM ward_logs
    WHERE teacher_id = ${teacherId} AND student_id = ${studentId}
      AND date >= ${from} AND date <= ${today}
    GROUP BY date
  `;
  return fillDailySeries(rows.map((r) => ({ date: r.date as string, value: Number(r.value ?? 0) })), from, today);
}

// ————— لوحة المطوّر (القصة 2) —————

/** تسميات حالات التسجيلات بترتيب العرض (قيم status بجدول mosque_registrations) */
export const REGISTRATION_LABELS: Record<string, string> = {
  pending: "بانتظار التوزيع",
  assigned: "مُوزَّعة",
  waitlisted: "قائمة الانتظار",
};

export type DevCharts = {
  /** أوراد المنصة يومياً — آخر ٣٠ يوماً */
  wardsDaily: DailyPoint[];
  /** طلاب جدد أسبوعياً — آخر ١٢ أسبوعاً (تسمية كل دلو أول يوم بأسبوعه) */
  newStudentsWeekly: CategoryPoint[];
  /** أفضل ١٠ جوامع بالطلاب الفعّالين ثم «أخرى» */
  topMosques: CategoryPoint[];
  /** حالات التسجيلات (عدد لكل حالة) */
  registrations: CategoryPoint[];
};

/** رسوم لوحة المطوّر — أرقام مجمّعة فقط (لا أسماء)، الأيام بتوقيت الرياض */
export async function devCharts(today = riyadhTodayISO()): Promise<DevCharts> {
  const from30 = windowFrom(today, WARDS_WINDOW_DAYS);
  // أول أسبوع بالنافذة = بداية أسبوع اليوم قبل ١١ أسبوعاً (نفس حساب weeklyBuckets)
  const from12w = addDaysISO(weekStartISO(today), -7 * (NEW_STUDENTS_WEEKS - 1));

  const [wardRows, createdRows, mosqueRows, registrationRows] = await Promise.all([
    db().sql`
      SELECT date, COUNT(*)::int AS value
      FROM ward_logs
      WHERE date >= ${from30} AND date <= ${today}
      GROUP BY date
    `,
    // created_at زمني مثبّت — اليوم المحلي بتوقيت الرياض، بلا UTC
    db().sql`
      SELECT to_char(created_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') AS date
      FROM students
      WHERE deleted_at IS NULL AND created_at IS NOT NULL
        AND to_char(created_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') >= ${from12w}
        AND to_char(created_at AT TIME ZONE 'Asia/Riyadh', 'YYYY-MM-DD') <= ${today}
    `,
    db().sql`
      SELECT m.name AS label, COUNT(s.id)::int AS value
      FROM mosques m
      JOIN halaqahs h ON h.mosque_id = m.id
      JOIN students s ON s.teacher_id = h.id AND s.active AND s.deleted_at IS NULL
      GROUP BY m.id, m.name
    `,
    db().sql`SELECT status, COUNT(*)::int AS value FROM mosque_registrations GROUP BY status`,
  ]);

  const registrationsByStatus = new Map(
    registrationRows.map((r) => [r.status as string, Number(r.value ?? 0)]),
  );

  return {
    wardsDaily: fillDailySeries(
      wardRows.map((r) => ({ date: r.date as string, value: Number(r.value ?? 0) })),
      from30,
      today,
    ),
    newStudentsWeekly: weeklyBuckets(
      createdRows.map((r) => ({ date: r.date as string })),
      NEW_STUDENTS_WEEKS,
      today,
    ),
    topMosques: topNWithOther(
      mosqueRows.map((r) => ({ label: r.label as string, value: Number(r.value ?? 0) })),
      TOP_N,
      OTHER_LABEL,
    ),
    // الحالات المعروفة دائماً بالترتيب نفسه (وإن كانت 0) — أي حالة غير معروفة تُلحق آخراً
    registrations: [
      ...Object.keys(REGISTRATION_LABELS),
      ...[...registrationsByStatus.keys()].filter((s) => !(s in REGISTRATION_LABELS)),
    ].map((status) => ({
      label: REGISTRATION_LABELS[status] ?? status,
      value: registrationsByStatus.get(status) ?? 0,
    })),
  };
}

// ————— لوحة مدير الجامع (القصة 3) —————

/** أفضل TOP_N بالنسبة المئوية؛ «أخرى» تُعاد حسابها من المجاميع الخام لا جمع النسب */
function topRates(items: { label: string; good: number; counted: number }[]): CategoryPoint[] {
  const sorted = [...items].sort(
    (a, b) => safePct(b.good, b.counted) - safePct(a.good, a.counted) || a.label.localeCompare(b.label, "ar"),
  );
  const head = sorted.slice(0, TOP_N).map((i) => ({ label: i.label, value: safePct(i.good, i.counted) }));
  const rest = sorted.slice(TOP_N);
  if (rest.length === 0) return head;
  const good = rest.reduce((sum, i) => sum + i.good, 0);
  const counted = rest.reduce((sum, i) => sum + i.counted, 0);
  return [...head, { label: OTHER_LABEL, value: safePct(good, counted) }];
}

export type MosqueCharts = {
  /** أوراد الجامع يومياً — آخر ٣٠ يوماً */
  wardsDaily: DailyPoint[];
  /** عدد الطلاب في كل حلقة (حلقة بلا طلاب = 0) */
  studentsPerHalaqah: CategoryPoint[];
  /** نسبة الحضور لكل حلقة خلال آخر ٣٠ يوماً (٪) */
  attendancePerHalaqah: CategoryPoint[];
  /** توزيع الإتقان على مستوى الجامع — نفس فئات صفحة المعلّم */
  mastery: { total: number; buckets: MasteryBucket[] };
};

/** رسوم لوحة الجامع — يستدعيها مسار الجامع (بعد فحص صلاحيته) ومسار الجمعية (بعد التحقق من الربط) */
export async function mosqueCharts(mosqueId: number, today = riyadhTodayISO()): Promise<MosqueCharts> {
  const from30 = windowFrom(today, WARDS_WINDOW_DAYS);

  const [wardRows, studentRows, attendanceRows, masteryRows] = await Promise.all([
    db().sql`
      SELECT w.date, COUNT(*)::int AS value
      FROM ward_logs w JOIN halaqahs h ON h.id = w.teacher_id
      WHERE h.mosque_id = ${mosqueId} AND w.date >= ${from30} AND w.date <= ${today}
      GROUP BY w.date
    `,
    db().sql`
      SELECT h.name AS label, COUNT(s.id) FILTER (WHERE s.active AND s.deleted_at IS NULL)::int AS value
      FROM halaqahs h LEFT JOIN students s ON s.teacher_id = h.id
      WHERE h.mosque_id = ${mosqueId}
      GROUP BY h.id, h.name
      ORDER BY h.name
    `,
    // نفس حساب الحضور بمؤشرات الجمعية: (حاضر+متأخر) ÷ (كل التسجيلات عدا «مستأذن»)
    db().sql`
      SELECT h.name AS label,
             COUNT(a.id) FILTER (WHERE a.status IN ('present', 'late'))::int AS good,
             COUNT(a.id) FILTER (WHERE a.status <> 'excused')::int AS counted
      FROM halaqahs h
      LEFT JOIN attendance a ON a.halaqah_id = h.id AND a.date >= ${from30} AND a.date <= ${today}
      WHERE h.mosque_id = ${mosqueId}
      GROUP BY h.id, h.name
      ORDER BY h.name
    `,
    // masteryDistribution يعمل على Student — نبني الحد الأدنى (عمود mastery فقط) بعد جلبه خاماً
    db().sql`
      SELECT s.mastery FROM students s JOIN halaqahs h ON h.id = s.teacher_id
      WHERE h.mosque_id = ${mosqueId} AND s.active AND s.deleted_at IS NULL
    `,
  ]);

  const students: Pick<Student, "mastery">[] = masteryRows.map((r) => ({
    mastery: JSON.parse(r.mastery as string) as Record<number, number>,
  }));

  return {
    wardsDaily: fillDailySeries(
      wardRows.map((r) => ({ date: r.date as string, value: Number(r.value ?? 0) })),
      from30,
      today,
    ),
    studentsPerHalaqah: topNWithOther(
      studentRows.map((r) => ({ label: r.label as string, value: Number(r.value ?? 0) })),
      TOP_N,
      OTHER_LABEL,
    ),
    attendancePerHalaqah: topRates(
      attendanceRows.map((r) => ({
        label: r.label as string,
        good: Number(r.good ?? 0),
        counted: Number(r.counted ?? 0),
      })),
    ),
    mastery: masteryDistribution(students as Student[]),
  };
}

// ————— لوحة الجمعية (القصة 4) —————

export type AssociationCharts = {
  /** أوراد كل جوامع الجمعية يومياً ضمن الفترة [from, to] */
  wardsDaily: DailyPoint[];
  /** مقارنة الجوامع: الطلاب الفعّالون (عدد) ونسبة الحضور (٪) */
  mosqueComparison: { activeStudents: CategoryPoint[]; attendanceRate: CategoryPoint[] };
};

/** رسوم لوحة الجمعية — الجوامع المرتبطة بجمعية الجلسة فقط، ضمن فترة الفلتر الحالية */
export async function associationCharts(
  associationId: number,
  range: { from: string; to: string },
): Promise<AssociationCharts> {
  const [wardRows, mosqueRows, studentRows, attendanceRows] = await Promise.all([
    db().sql`
      SELECT w.date, COUNT(*)::int AS value
      FROM ward_logs w
      JOIN halaqahs h ON h.id = w.teacher_id
      JOIN mosques m ON m.id = h.mosque_id
      WHERE m.association_id = ${associationId} AND w.date >= ${range.from} AND w.date <= ${range.to}
      GROUP BY w.date
    `,
    db().sql`SELECT id, name FROM mosques WHERE association_id = ${associationId} ORDER BY name`,
    db().sql`
      SELECT h.mosque_id, COUNT(*)::int AS active_students
      FROM students s
      JOIN halaqahs h ON h.id = s.teacher_id
      JOIN mosques m ON m.id = h.mosque_id
      WHERE m.association_id = ${associationId} AND s.active AND s.deleted_at IS NULL
      GROUP BY h.mosque_id
    `,
    db().sql`
      SELECT h.mosque_id,
             COUNT(*) FILTER (WHERE a.status IN ('present', 'late'))::int AS good,
             COUNT(*) FILTER (WHERE a.status <> 'excused')::int AS counted
      FROM attendance a
      JOIN halaqahs h ON h.id = a.halaqah_id
      JOIN mosques m ON m.id = h.mosque_id
      WHERE m.association_id = ${associationId} AND a.date >= ${range.from} AND a.date <= ${range.to}
      GROUP BY h.mosque_id
    `,
  ]);

  const studentsBy = new Map(studentRows.map((r) => [Number(r.mosque_id), Number(r.active_students ?? 0)]));
  const attendanceBy = new Map(
    attendanceRows.map((r) => [Number(r.mosque_id), { good: Number(r.good ?? 0), counted: Number(r.counted ?? 0) }]),
  );

  return {
    wardsDaily: fillDailySeries(
      wardRows.map((r) => ({ date: r.date as string, value: Number(r.value ?? 0) })),
      range.from,
      range.to,
    ),
    mosqueComparison: {
      activeStudents: topNWithOther(
        mosqueRows.map((r) => ({ label: r.name as string, value: studentsBy.get(Number(r.id)) ?? 0 })),
        TOP_N,
        OTHER_LABEL,
      ),
      attendanceRate: topRates(
        mosqueRows.map((r) => ({
          label: r.name as string,
          ...(attendanceBy.get(Number(r.id)) ?? { good: 0, counted: 0 }),
        })),
      ),
    },
  };
}
