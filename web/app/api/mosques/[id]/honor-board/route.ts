import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { isPeriodChoice, resolvePeriod } from "@/lib/mosque/report-periods";
import { getMetricsForHalaqah } from "@/lib/mosque/halaqat";
import {
  getMosque,
  isFeatureEnabled,
  listActivities,
  listCommitteeMemberLinks,
  listEvaluationSummaries,
  listFamilyMemberLinks,
  listHalaqahs,
  listMosqueRegistrations,
  listStudentBadgeAwardsBetween,
  type Halaqah,
} from "@/lib/mosque/db";
import { rankHalaqahs, rankStudents, type StudentPrograms } from "@/lib/mosque/honor-board";
import type { HalaqahMetrics } from "@/lib/metrics";
import { honorBoardCacheKey, readHonorBoardCache, storeHonorBoardCache } from "@/lib/mosque/honor-board-cache";

const PERIOD_ERROR = "period يجب أن يكون this_week أو last_week أو hijri_month أو custom";
const CUSTOM_ERROR = "النطاق المخصص يحتاج from وto تاريخين صالحين (from ≤ to)";
const TOP_STUDENTS_LIMIT = 10;

type HonorBoardPayload = {
  mosque: { name: string; city: string };
  period: { from: string; to: string };
  halaqahs: ReturnType<typeof rankHalaqahs>;
  students: ReturnType<typeof rankStudents>["students"];
  rankedStudents: number;
  unmatchedCount: number;
};

/** استعلام لا يرمي أبداً — فشل مقياس حلقة يُسقطها من الترتيب ولا يكسر الطلب */
async function safeMetrics(halaqah: Halaqah, from: string, to: string): Promise<HalaqahMetrics | null> {
  try {
    return await getMetricsForHalaqah(halaqah, from, to);
  } catch {
    return null;
  }
}

/**
 * لوحة الشرف لفترة واحدة: مقاييس كل الحلقات من قاعدة الحلقات بالتوازي،
 * ودرجات برامج الجامع (تقييم/أوسمة/أسر ولجان/أنشطة) — كل مصدر يُقرأ فقط
 * عند تفعيل ميزته. النتيجة تكشف 5 دقائق لكل (جامع، فترة) كي لا تُثقل
 * القاعدة بكل فتح صفحة.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "honor_board");
  if (gate) return gate;

  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period") ?? "this_week";
  if (!isPeriodChoice(periodParam)) return Response.json({ error: PERIOD_ERROR }, { status: 400 });

  const period = resolvePeriod(periodParam, {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!period) return Response.json({ error: CUSTOM_ERROR }, { status: 400 });

  const cacheKey = honorBoardCacheKey(mosqueId, period.from, period.to);
  const cached = readHonorBoardCache<HonorBoardPayload>(cacheKey);
  if (cached) return Response.json(cached);

  const mosque = await getMosque(mosqueId);
  if (!mosque) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  const [halaqatOn, evaluationOn, badgesOn, familiesOn, committeesOn, archiveOn] = await Promise.all(
    (["halaqat", "weekly_evaluation", "badges", "families", "committees", "archive"] as const).map((key) =>
      isFeatureEnabled(mosqueId, key),
    ),
  );

  const halaqahs = halaqatOn ? await listHalaqahs(mosqueId) : [];
  const metrics = await Promise.all(
    halaqahs.map((halaqah) => safeMetrics(halaqah, period.from, period.to)),
  );

  // برامج الجامع: تُقرأ كلها دفعة واحدة ثم تُفهرس بالطالب — لا استعلام لكل طالب
  const [registrations, studentSummaries, badgeAwards, familyLinks, committeeLinks, activities] = await Promise.all([
    listMosqueRegistrations(mosqueId),
    evaluationOn ? listEvaluationSummaries(mosqueId, period.from, period.to, "student") : Promise.resolve([]),
    badgesOn ? listStudentBadgeAwardsBetween(mosqueId, period.from, period.to) : Promise.resolve([]),
    familiesOn ? listFamilyMemberLinks(mosqueId) : Promise.resolve([]),
    committeesOn ? listCommitteeMemberLinks(mosqueId) : Promise.resolve([]),
    archiveOn ? listActivities(mosqueId) : Promise.resolve([]),
  ]);

  const evalByTarget = new Map(studentSummaries.map((row) => [row.targetId, row]));
  const badgesByTarget = new Map<number, { icon: string; name: string }[]>();
  for (const award of badgeAwards) {
    const list = badgesByTarget.get(award.targetId) ?? [];
    list.push({ icon: award.icon, name: award.name });
    badgesByTarget.set(award.targetId, list);
  }
  const familiesOfStudent = new Map<number, number[]>();
  for (const link of familyLinks) {
    if (link.memberKind !== "student") continue;
    const list = familiesOfStudent.get(link.memberId) ?? [];
    list.push(link.familyId);
    familiesOfStudent.set(link.memberId, list);
  }
  const inCommittee = new Set(
    committeeLinks.filter((link) => link.memberKind === "student").map((link) => link.memberId),
  );
  const inPeriod = (date: string) => date >= period.from && date <= period.to;
  const activitiesByHalaqah = new Map<number, number>();
  const activitiesByFamily = new Map<number, number>();
  for (const activity of activities) {
    if (activity.tagId === null || !inPeriod(activity.activityDate)) continue;
    const map = activity.tagKind === "halaqah" ? activitiesByHalaqah : activity.tagKind === "family" ? activitiesByFamily : null;
    if (map) map.set(activity.tagId, (map.get(activity.tagId) ?? 0) + 1);
  }

  const programs: StudentPrograms[] = registrations
    .filter((student) => student.status === "assigned" && student.halaqahId !== null)
    .map((student) => {
      const familyIds = familiesOfStudent.get(student.id) ?? [];
      const summary = evalByTarget.get(student.id);
      return {
        registrationId: student.id,
        studentId: student.studentId,
        halaqahId: student.halaqahId as number,
        name: student.name,
        evaluationPercent: summary && summary.maxTotal > 0 ? Math.round((summary.total / summary.maxTotal) * 100) : null,
        badges: badgesByTarget.get(student.id) ?? [],
        inFamily: familyIds.length > 0,
        inCommittee: inCommittee.has(student.id),
        activities:
          (activitiesByHalaqah.get(student.halaqahId as number) ?? 0) +
          familyIds.reduce((sum, familyId) => sum + (activitiesByFamily.get(familyId) ?? 0), 0),
      };
    });

  const halaqahRows = rankHalaqahs(
    halaqahs.map((halaqah, index) => ({
      halaqahId: halaqah.id,
      name: halaqah.halaqahName,
      teacherName: halaqah.teacherName,
      metrics: metrics[index],
    })),
  );
  const ranking = rankStudents(
    halaqahs.map((halaqah, index) => ({ halaqahId: halaqah.id, name: halaqah.halaqahName, metrics: metrics[index] })),
    programs,
  );

  const payload: HonorBoardPayload = {
    mosque: { name: mosque.name, city: mosque.city },
    period,
    halaqahs: halaqahRows,
    students: ranking.students.slice(0, TOP_STUDENTS_LIMIT),
    rankedStudents: ranking.students.length,
    unmatchedCount: ranking.unmatchedCount,
  };
  // لا نخزّن كشفاً فيه حلقة متعذّرة: فشل عابر لا يلصق 5 دقائق
  if (metrics.every((m) => m !== null)) storeHonorBoardCache(cacheKey, payload);
  return Response.json(payload);
}
