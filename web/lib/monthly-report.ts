/*
  السجلّ الشهري للطالب (STEP 53) — تجميع بحت من WardLog[] الموجودة
  أصلاً (ward_logs + ward_review_segments عبر listAllWardLogsForStudent)،
  بلا أي استعلام إضافي أو migration. دالة صرفة (لا I/O) يستوردها كل من
  مسار API ونموذجه، فتبقى الحسابات بمكان واحد ومختبَرة بمعزل عن قاعدة
  البيانات.
*/
import type { WardLog } from "./types";

export type MonthlySummary = {
  /** YYYY-MM */
  key: string;
  year: number;
  /** 1..12 */
  month: number;
  hifzPages: number;
  reviewPages: number;
  totalPages: number;
  activeDays: number;
  approvedCount: number;
  wardCount: number;
};

function monthKeyOf(date: string): string {
  return date.slice(0, 7);
}

/**
 * يجمّع سجلّ الطالب شهرياً — الأحدث أولاً. صفحات الحفظ من hifz.to-hifz.from+1
 * (نفس حساب الواجهة الحالي)، وصفحات المراجعة من reviewPagesTotal الجاهزة
 * (STEP 52 — تجمع كل مقطع على حدة، صحيحة لكل من الأوراد القديمة بمقطع
 * واحد والجديدة بعدّة مقاطع بلا أي تمييز هنا). "الأيام النشطة" = عدد
 * التواريخ الفريدة (لا عدد الأوراد — قد يُرسَل أكثر من ورد بنفس اليوم
 * عبر محاولة جديدة بعد "يحتاج إعادة").
 */
export function buildMonthlySummaries(wards: WardLog[]): MonthlySummary[] {
  const byMonth = new Map<
    string,
    { hifzPages: number; reviewPages: number; days: Set<string>; approved: number; count: number }
  >();

  for (const w of wards) {
    const key = monthKeyOf(w.date);
    let e = byMonth.get(key);
    if (!e) {
      e = { hifzPages: 0, reviewPages: 0, days: new Set(), approved: 0, count: 0 };
      byMonth.set(key, e);
    }
    if (w.hifz) e.hifzPages += w.hifz.to - w.hifz.from + 1;
    e.reviewPages += w.reviewPagesTotal;
    e.days.add(w.date);
    if (w.status === "approved") e.approved++;
    e.count++;
  }

  return [...byMonth.entries()]
    .map(([key, e]) => {
      const [year, month] = key.split("-").map(Number);
      return {
        key,
        year,
        month,
        hifzPages: e.hifzPages,
        reviewPages: e.reviewPages,
        totalPages: e.hifzPages + e.reviewPages,
        activeDays: e.days.size,
        approvedCount: e.approved,
        wardCount: e.count,
      };
    })
    .sort((a, b) => (a.key < b.key ? 1 : -1));
}
