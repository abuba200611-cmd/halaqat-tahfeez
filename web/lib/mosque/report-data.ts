import "server-only";

import type { ReportPeriod } from "@/lib/mosque/report-periods";
import { getHalaqahStats, getMetricsForHalaqah, type HalaqahStats } from "@/lib/mosque/halaqat";
import type { HalaqahMetrics } from "@/lib/metrics";
import {
  countActivitiesBetween,
  countBadgeAwardsBetween,
  countFamilies,
  countPendingRegistrations,
  getMosque,
  isFeatureEnabled,
  listBadgeTopBetween,
  listCommitteeTaskSummaries,
  listEvaluationSummaries,
  listHalaqahs,
  type EvaluationSummaryRow,
} from "@/lib/mosque/db";

/*
  باني تقرير الفترة — منطق الحساب نفسه الذي كان داخل المسار، مخرَجاً هنا
  ليشترك فيه مسار HTTP وقراءة أداة الإيجنت (نفس الأرقام بنفس الفترة).
*/

export type MosqueReportPayload = {
  mosque: { name: string; city: string };
  period: ReportPeriod;
  enabled: Record<string, boolean>;
  kpis: {
    halaqatCount: number;
    activeStudents: number;
    unreachableHalaqat: number;
    pendingRegistrations: number;
    familiesCount: number;
    committeesCount: number;
    openTasks: number;
    evaluationsAvgPercent: number | null;
    badgesAwarded: number;
    activities: number | null;
  };
  topFamilies: { name: string; total: number; maxTotal: number; percent: number }[];
  topStudents: { name: string; total: number; maxTotal: number; percent: number }[];
  badges: Awaited<ReturnType<typeof listBadgeTopBetween>>;
  halaqat: {
    name: string;
    teacher: string;
    activeStudents: number | null;
    avgMastery: number | null;
    totalPages: number | null;
    metrics: {
      attendanceRate: number | null;
      wardsSubmitted: number;
      wardsApproved: number;
      planOnTrackRatio: number | null;
      recitationsCount: number;
      recitationsAvgScore: number | null;
    } | null;
  }[];
};

/**
 * تقرير فترة واحدة: مؤشرات مجمّعة من مزايا الجامع الأخرى. كل قسم يُقرأ
 * فقط عند تفعيل ميزته (كخصوصية بين المزايا)، وإحصائيات الحلقات من قاعدة
 * الحلقات مباشرة — فشل استعلام حلقة لا يكسر التقرير كله.
 */
export async function buildMosqueReport(mosqueId: number, period: ReportPeriod): Promise<MosqueReportPayload> {
  const mosque = await getMosque(mosqueId);
  if (!mosque) throw new Error("mosque not found");

  const [halaqatOn, registrationOn, familiesOn, committeesOn, evaluationOn, badgesOn, archiveOn] = await Promise.all(
    (["halaqat", "registration", "families", "committees", "weekly_evaluation", "badges", "archive"] as const).map((key) =>
      isFeatureEnabled(mosqueId, key),
    ),
  );

  const halaqahs = halaqatOn ? await listHalaqahs(mosqueId) : [];
  // إحصائيات كل حلقة + مقاييس فترة التقرير من قاعدة الحلقات بالتوازي — تعذّر أحدهما لا يكسر البقية
  const [stats, metrics] = await Promise.all([
    Promise.all(
      halaqahs.map(async (halaqah): Promise<HalaqahStats | null> => {
        try {
          return await getHalaqahStats(halaqah.id);
        } catch {
          return null;
        }
      }),
    ),
    Promise.all(
      halaqahs.map(async (halaqah): Promise<HalaqahMetrics | null> => {
        try {
          return await getMetricsForHalaqah(halaqah, period.from, period.to);
        } catch {
          return null;
        }
      }),
    ),
  ]);
  const reachable = stats.filter((s): s is HalaqahStats => s !== null);

  const [pending, families, committeeSummaries, familySummaries, studentSummaries, badgesAwarded, badgeTop, activities] =
    await Promise.all([
      registrationOn ? countPendingRegistrations(mosqueId) : Promise.resolve(0),
      familiesOn ? countFamilies(mosqueId) : Promise.resolve(0),
      committeesOn ? listCommitteeTaskSummaries(mosqueId) : Promise.resolve([]),
      evaluationOn ? listEvaluationSummaries(mosqueId, period.from, period.to, "family") : Promise.resolve([]),
      evaluationOn ? listEvaluationSummaries(mosqueId, period.from, period.to, "student") : Promise.resolve([]),
      badgesOn ? countBadgeAwardsBetween(mosqueId, period.from, period.to) : Promise.resolve(0),
      badgesOn ? listBadgeTopBetween(mosqueId, period.from, period.to) : Promise.resolve([]),
      archiveOn ? countActivitiesBetween(mosqueId, period.from, period.to) : Promise.resolve(null),
    ]);

  const totals = [...familySummaries, ...studentSummaries].reduce(
    (sum, row) => ({ total: sum.total + row.total, maxTotal: sum.maxTotal + row.maxTotal }),
    { total: 0, maxTotal: 0 },
  );
  const evaluationsAvgPercent = totals.maxTotal > 0 ? Math.round((totals.total / totals.maxTotal) * 100) : null;

  const top = (rows: EvaluationSummaryRow[]) =>
    rows.slice(0, 5).map((row) => ({
      name: row.name,
      total: row.total,
      maxTotal: row.maxTotal,
      percent: row.maxTotal > 0 ? Math.round((row.total / row.maxTotal) * 100) : 0,
    }));

  return {
    mosque: { name: mosque.name, city: mosque.city },
    period,
    enabled: { halaqat: halaqatOn, registration: registrationOn, families: familiesOn, committees: committeesOn, weekly_evaluation: evaluationOn, badges: badgesOn },
    kpis: {
      halaqatCount: halaqahs.length,
      activeStudents: reachable.reduce((sum, s) => sum + s.activeStudents, 0),
      unreachableHalaqat: halaqahs.length - reachable.length,
      pendingRegistrations: pending,
      familiesCount: families,
      committeesCount: committeeSummaries.length,
      openTasks: committeeSummaries.reduce((sum, row) => sum + row.openTasks, 0),
      evaluationsAvgPercent,
      badgesAwarded,
      activities,
    },
    topFamilies: top(familySummaries),
    topStudents: top(studentSummaries),
    badges: badgeTop,
    halaqat: halaqahs.map((halaqah, index) => ({
      name: halaqah.halaqahName,
      teacher: halaqah.teacherName,
      activeStudents: stats[index]?.activeStudents ?? null,
      avgMastery: stats[index]?.avgMastery ?? null,
      totalPages: stats[index]?.totalPages ?? null,
      metrics:
        metrics[index] === null
          ? null
          : {
              attendanceRate: (metrics[index] as HalaqahMetrics).totals.attendanceRate,
              wardsSubmitted: (metrics[index] as HalaqahMetrics).totals.wardsSubmitted,
              wardsApproved: (metrics[index] as HalaqahMetrics).totals.wardsApproved,
              planOnTrackRatio: (metrics[index] as HalaqahMetrics).totals.planOnTrackRatio,
              recitationsCount: (metrics[index] as HalaqahMetrics).totals.recitations.count,
              recitationsAvgScore: (metrics[index] as HalaqahMetrics).totals.recitations.avgScore,
            },
    })),
  };
}
