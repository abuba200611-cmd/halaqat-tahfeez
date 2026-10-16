import "server-only";

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
import { getMetricsForHalaqah } from "@/lib/mosque/halaqat";
import { rankHalaqahs, rankStudents, type StudentPrograms } from "@/lib/mosque/honor-board";
import type { HalaqahMetrics } from "@/lib/metrics";
import type { ReportPeriod } from "@/lib/mosque/report-periods";
import { honorBoardCacheKey, readHonorBoardCache, storeHonorBoardCache } from "@/lib/mosque/honor-board-cache";

/*
  باني لوحة الشرف — منطق الحساب نفسه الذي كان داخل المسار، مخرَجاً هنا
  ليشترك فيه مسار HTTP وقراءة أداة الإيجنت (نفس الأرقام بنفس الفترة).
*/

const TOP_STUDENTS_LIMIT = 10;

export type HonorBoardPayload = {
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
 * لوحة الشرف لفترة محلولة: مقاييس كل الحلقات من قاعدة الحلقات بالتوازي،
 * ودرجات برامج الجامع (تقييم/أوسمة/أسر ولجان/أنشطة) — كل مصدر يُقرأ فقط
 * عند تفعيل ميزته. النتيجة تكشف 5 دقائق لكل (جامع، فترة) كي لا تُثقل
 * القاعدة بكل فتح صفحة.
 */
export async function buildHonorBoard(mosqueId: number, period: ReportPeriod): Promise<HonorBoardPayload> {
  const cacheKey = honorBoardCacheKey(mosqueId, period.from, period.to);
  const cached = readHonorBoardCache<HonorBoardPayload>(cacheKey);
  if (cached) return cached;

  const mosque = await getMosque(mosqueId);
  if (!mosque) throw new Error("mosque not found");

  const [halaqatOn, evaluationOn, badgesOn, familiesOn, committeesOn, archiveOn] = await Promise.all(
    (["halaqat", "weekly_evaluation", "badges", "families", "committees", "archive"] as const).map((key) =>
      isFeatureEnabled(mosqueId, key),
    ),
  );

  const halaqahs = halaqatOn ? await listHalaqahs(mosqueId) : [];
  const metrics = await Promise.all(halaqahs.map((halaqah) => safeMetrics(halaqah, period.from, period.to)));

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
  return payload;
}
