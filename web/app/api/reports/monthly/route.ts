import { currentTeacher, unauthorized } from "@/lib/auth";
import { listStudentLinks, listWardLogs } from "@/lib/db";
import { listWardsForUsernames } from "@/lib/tasjeel-db";

type MonthlyReport = {
  key: string;
  hifzPages: number;
  reviewPages: number;
  activeStudents: number;
};

function monthKey(date: string): string {
  return date.slice(0, 7);
}

/**
 * أداء الحلقة الشهري: يجمع صفحات الحفظ والمراجعة من مصدرين معاً —
 * الطلاب المرتبطين بتسجيل الطلاب (المصدر الأساسي اليوم) + أي ورد قديم
 * من نظام الطلاب الداخلي (student-auth، إن استُخدم). "الطلاب النشطون"
 * لكل شهر = عدد فريد بغضّ النظر عن المصدر.
 */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const links = await listStudentLinks(teacher.id);
  const usernames = Object.values(links);

  const [tasjeelWards, legacyWards] = await Promise.all([
    listWardsForUsernames(usernames).catch(() => []),
    listWardLogs(teacher.id),
  ]);

  const byMonth = new Map<string, { hifzPages: number; reviewPages: number; active: Set<string> }>();
  const entry = (key: string) => {
    let e = byMonth.get(key);
    if (!e) {
      e = { hifzPages: 0, reviewPages: 0, active: new Set() };
      byMonth.set(key, e);
    }
    return e;
  };

  for (const w of tasjeelWards) {
    const e = entry(monthKey(w.date));
    e.hifzPages += w.hifzPages ?? 0;
    e.reviewPages += w.reviewPages ?? 0;
    e.active.add(`t:${w.username}`);
  }
  for (const w of legacyWards) {
    const e = entry(monthKey(w.date));
    if (w.hifz) e.hifzPages += w.hifz.to - w.hifz.from + 1;
    if (w.review) e.reviewPages += w.review.to - w.review.from + 1;
    e.active.add(`l:${w.studentId}`);
  }

  const months: MonthlyReport[] = [...byMonth.entries()]
    .map(([key, v]) => ({ key, hifzPages: v.hifzPages, reviewPages: v.reviewPages, activeStudents: v.active.size }))
    .sort((a, b) => (a.key < b.key ? 1 : -1));

  return Response.json({ months });
}
