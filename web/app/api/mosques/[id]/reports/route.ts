import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { isPeriodChoice, resolvePeriod } from "@/lib/mosque/report-periods";
import { fetchHalaqahMetrics, fetchHalaqahStats, type HalaqahStats } from "@/lib/mosque/halaqat";
import type { HalaqahMetrics } from "@/lib/mosque/honor-board";
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

const PERIOD_ERROR = "period يجب أن يكون this_week أو last_week أو hijri_month أو custom";
const CUSTOM_ERROR = "النطاق المخصص يحتاج from وto تاريخين صالحين (from ≤ to)";

/**
 * تقرير فترة واحدة: مؤشرات مجمّعة من مزايا الجامع الأخرى. كل قسم يُقرأ
 * فقط عند تفعيل ميزته (كخصوصية بين المزايا)، وإحصائيات الحلقات من نظام
 * المعلّم مباشرة — تعذّر حلقة لا يكسر التقرير كله.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "reports");
  if (gate) return gate;

  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "this_week";
  if (!isPeriodChoice(periodParam)) return Response.json({ error: PERIOD_ERROR }, { status: 400 });

  const period = resolvePeriod(periodParam, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!period) return Response.json({ error: CUSTOM_ERROR }, { status: 400 });

  const mosque = await getMosque(mosqueId);
  if (!mosque) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  const [halaqatOn, registrationOn, familiesOn, committeesOn, evaluationOn, badgesOn, archiveOn] = await Promise.all(
    (["halaqat", "registration", "families", "committees", "weekly_evaluation", "badges", "archive"] as const).map((key) =>
      isFeatureEnabled(mosqueId, key),
    ),
  );

  const halaqahs = halaqatOn ? await listHalaqahs(mosqueId) : [];
  // إحصائيات كل حلقة + مقاييس فترة التقرير من نظام المعلّم بالتوازي — تعذّر أحدهما لا يكسر البقية
  const [stats, metrics] = await Promise.all([
    Promise.all(
      halaqahs.map(async (halaqah): Promise<HalaqahStats | null> => {
        try {
          return await fetchHalaqahStats(halaqah.inviteCode);
        } catch {
          return null;
        }
      }),
    ),
    Promise.all(
      halaqahs.map(async (halaqah): Promise<HalaqahMetrics | null> => {
        try {
          return await fetchHalaqahMetrics(halaqah.inviteCode, period.from, period.to);
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

  return Response.json({
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
  });
}
