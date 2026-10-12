import "server-only";

import { db } from "./db";
import { hijriMonthOfISO, hijriMonthRange } from "./hijri";
import { buildHalaqahMetrics, type HalaqahMetrics, type MetricsRange } from "./metrics";
import { getMonthActuals, listHalaqahPlans } from "./plan-db";
import type { AttendanceStatus } from "./attendance";
import type { WardStatus } from "./types";

/*
  STEP 66 — جلب مقاييس الحلقة كاملة بعدد استعلامات ثابت (٥) مهما كان
  عدد الطلاب — لا N+1 لكل طالب. كلها قراءة فقط على فهارس قائمة بلا أي
  migration: idx_ward_logs_halaqah_date، idx_attendance_halaqah_date،
  idx_monthly_plans_halaqah_month، idx_recitations_halaqah_status.

  الحلقة تأتي من رمز دعوة الطلاب وحده (المسار يحلّها بـ
  findHalaqahByInviteCode) — لا استعلام هنا يقبل معرّف حلقة من العميل.
  كل استعلام يقيّد الطلاب بالفعّالين غير المحذوفين (نفس شرط
  listHalaqahPlans) فلا تدخل أوراد/تلاوات محذوف أو موقوف الحسابَ في
  المقاييس.
*/

export async function getHalaqahMetrics(
  halaqah: { id: number; halaqahName: string; teacherName: string },
  range: MetricsRange,
  today: string,
): Promise<HalaqahMetrics> {
  const month = hijriMonthOfISO(today);
  const monthRange = hijriMonthRange(month);

  const [planRows, planActuals, wardRows, attendanceRows, recitationRows] = await Promise.all([
    // الطلاب الفعّالون + مستهدف خطة الشهر الهجري الجاري إن وُجدت (استعلام معاد استخدامه من STEP 63)
    listHalaqahPlans(halaqah.id, month),
    // إنجاز الشهر الهجري الجاري من ward_logs — خارج النطاق المطلوب أحياناً
    getMonthActuals(halaqah.id, monthRange.start, monthRange.end),
    // أوراد النطاق بكل الحالات؛ صفحات المراجعة بنفس حساب getMonthActuals (مقاطع STEP 52 ثم النطاق القديم)
    db().sql`
      SELECT w.student_id, w.date, w.status, w.hifz_from, w.hifz_to,
             COALESCE(
               (SELECT SUM(rs.to_page - rs.from_page + 1) FROM ward_review_segments rs WHERE rs.ward_log_id = w.id),
               CASE WHEN w.review_from IS NOT NULL AND w.review_to IS NOT NULL THEN w.review_to - w.review_from + 1 END,
               0
             )::int AS review_pages
      FROM ward_logs w
      JOIN students s ON s.teacher_id = w.teacher_id AND s.id = w.student_id AND s.active AND s.deleted_at IS NULL
      WHERE w.teacher_id = ${halaqah.id} AND w.date >= ${range.from} AND w.date <= ${range.to}
    `,
    // قرارات الحضور المخزَّنة للنطاق (الحضور الضمني من الأوراد يُشتق بالبنّاء)
    db().sql`
      SELECT a.student_id, a.date, a.status
      FROM attendance a
      JOIN students s ON s.teacher_id = a.halaqah_id AND s.id = a.student_id AND s.active AND s.deleted_at IS NULL
      WHERE a.halaqah_id = ${halaqah.id} AND a.date >= ${range.from} AND a.date <= ${range.to}
    `,
    // تجميع التلاوات للنطاق بتاريخ الرياض (created_at زمني مثبّت) — متوسط الدرجات للمقيَّمة فقط
    db().sql`
      SELECT r.student_id,
             COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE r.status = 'reviewed' AND r.score IS NOT NULL)::int AS scored,
             COALESCE(SUM(r.score) FILTER (WHERE r.status = 'reviewed' AND r.score IS NOT NULL), 0)::int AS score_sum
      FROM recitations r
      JOIN students s ON s.teacher_id = r.halaqah_id AND s.id = r.student_id AND s.active AND s.deleted_at IS NULL
      WHERE r.halaqah_id = ${halaqah.id}
        AND (r.created_at AT TIME ZONE 'Asia/Riyadh')::date >= ${range.from}::date
        AND (r.created_at AT TIME ZONE 'Asia/Riyadh')::date <= ${range.to}::date
      GROUP BY r.student_id
    `,
  ]);

  return buildHalaqahMetrics({
    halaqahName: halaqah.halaqahName,
    teacherName: halaqah.teacherName,
    today,
    range,
    students: planRows.map((r) => ({ id: r.studentId, name: r.name, plan: r.plan })),
    planActuals,
    wards: wardRows.map((r) => ({
      studentId: r.student_id as string,
      date: r.date as string,
      status: r.status as WardStatus,
      hifz:
        r.hifz_from !== null && r.hifz_to !== null
          ? { from: r.hifz_from as number, to: r.hifz_to as number }
          : null,
      reviewPages: Number(r.review_pages ?? 0),
    })),
    attendance: attendanceRows.map((r) => ({
      studentId: r.student_id as string,
      date: r.date as string,
      status: r.status as AttendanceStatus,
    })),
    recitations: recitationRows.map((r) => ({
      studentId: r.student_id as string,
      count: Number(r.n ?? 0),
      scored: Number(r.scored ?? 0),
      scoreSum: Number(r.score_sum ?? 0),
    })),
  });
}
