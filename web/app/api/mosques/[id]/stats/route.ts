import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { isFeatureEnabled, listHalaqahs } from "@/lib/mosque/db";
import { getHalaqahStats } from "@/lib/mosque/halaqat";

/**
 * لوحة الجامع الحقيقية — يجمع إحصائيات كل حلقاته من قاعدة الحلقات (استعلامات
 * مباشرة متوازية) ويرجع الإجمالي + تفصيل كل حلقة. حلقة فشل استعلامها
 * (خطأ عابر بالقاعدة) تُستبعد من الإجمالي بدل ما تكسر
 * اللوحة كاملة. معطّلة "الإحصائيات" عن الجامع = 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await isFeatureEnabled(mosqueId, "stats"))) {
    return Response.json({ error: "الإحصائيات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }

  const halaqahs = await listHalaqahs(mosqueId);
  const results = await Promise.all(
    halaqahs.map(async (h) => ({ halaqah: h, stats: await getHalaqahStats(h.id).catch(() => null) })),
  );

  const perHalaqah = results.map(({ halaqah, stats }) => ({
    id: halaqah.id,
    halaqahName: halaqah.halaqahName,
    teacherName: halaqah.teacherName,
    stats,
  }));

  const reachable = results.filter((r) => r.stats !== null).map((r) => r.stats!);
  const totalActiveStudents = reachable.reduce((sum, s) => sum + s.activeStudents, 0);
  const totalPages = reachable.reduce((sum, s) => sum + s.totalPages, 0);
  const weightedMastery = reachable.reduce((sum, s) => sum + s.avgMastery * s.activeStudents, 0);
  const avgMastery = totalActiveStudents ? Math.round(weightedMastery / totalActiveStudents) : 0;

  return Response.json({
    halaqahCount: halaqahs.length,
    unreachableCount: results.length - reachable.length,
    totalActiveStudents,
    totalPages,
    avgMastery,
    perHalaqah,
  });
}
