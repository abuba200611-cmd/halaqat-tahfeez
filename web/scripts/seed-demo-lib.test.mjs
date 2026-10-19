import { describe, expect, it } from "vitest";
import {
  DEMO_PREFIX, FEATURES_OFF, FEATURES_ON, SURAH_AYAHS, SURAH_START_PAGES, TOTAL_PAGES,
  addDays, buildPlan, makeRng, pageRangeToAyahs, pagesForJuzCount, sessionDays, studentFullName,
  summarizePlan, weekdayOf,
} from "./seed-demo-lib.mjs";

const TODAY = "2026-10-20";

describe("مولّد البذر التجريبي — دوال نقية", () => {
  it("المولّد حتمي بالبذرة", () => {
    const a = makeRng(5);
    const b = makeRng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(makeRng(5)()).not.toBe(makeRng(6)());
  });

  it("نفس البذرة والتاريخ = نفس الخطة حرفياً، وبذرة أخرى تغيّرها", () => {
    const one = JSON.stringify(buildPlan({ today: TODAY, seed: 1 }));
    expect(JSON.stringify(buildPlan({ today: TODAY, seed: 1 }))).toBe(one);
    expect(JSON.stringify(buildPlan({ today: TODAY, seed: 2 }))).not.toBe(one);
  });

  it("الأعداد المطلوبة: جمعية و٣ جوامع و٧ حلقات وحوالي ٧٠ طالباً", () => {
    const plan = buildPlan({ today: TODAY });
    const { counts } = summarizePlan(plan);
    expect(counts.associations).toBe(1);
    expect(plan.mosques.map((m) => m.name)).toEqual([
      "(تجريبي) جامع النور", "(تجريبي) جامع الهدى", "(تجريبي) جامع الفرقان",
    ]);
    expect(plan.mosques.filter((m) => m.linkedToAssociation)).toHaveLength(2);
    expect(plan.halaqat).toHaveLength(7);
    expect(counts.halaqahs_new + counts.halaqahs_linked_existing).toBe(7);
    expect(counts.halaqahs_linked_existing).toBe(1);
    for (const mosque of plan.mosques) {
      const n = plan.halaqat.filter((h) => h.mosque === mosque.key).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
    expect(counts.students).toBe(70);
    for (const h of plan.halaqat) {
      const n = plan.students.filter((s) => s.halaqah === h.key).length;
      expect(n).toBeGreaterThanOrEqual(8);
      expect(n).toBeLessThanOrEqual(12);
    }
    expect(counts.teachers).toBe(6); // حلقة المعلّم 70 لا تحتاج معلّماً جديداً
    expect(counts.mosque_registrations).toBe(4);
    expect(counts.supervisor_visits).toBe(2);
    expect(plan.visits.map((v) => v.status).sort()).toEqual(["done", "scheduled"]);
  });

  it("كل الأسماء موسومة وفريدة ولا تحوي أسماء مدن", () => {
    const plan = buildPlan({ today: TODAY });
    const names = [
      plan.association.name, ...plan.mosques.map((m) => m.name), ...plan.halaqat.map((h) => h.name).filter(Boolean),
      ...plan.teachers.map((t) => t.name), ...plan.students.map((s) => s.name), ...plan.registrations.map((r) => r.name),
      ...plan.examTypes.map((e) => e.name), ...plan.feePlans.map((f) => f.name),
    ];
    for (const n of names) expect(n.startsWith(DEMO_PREFIX)).toBe(true);
    expect(new Set(plan.students.map((s) => s.name)).size).toBe(plan.students.length);
    expect(new Set(plan.students.map((s) => s.id)).size).toBe(plan.students.length);
    expect(new Set(Array.from({ length: 1000 }, (_, i) => studentFullName(i))).size).toBe(1000);
    const forbidden = /الرياض|جدة|مكة|المدينة|الدمام|القاهرة|دبي|عمّان|بغداد/;
    expect(forbidden.test(JSON.stringify(plan))).toBe(false);
  });

  it("المعلّمون الجدد بلا كلمة مرور صالحة (لا يظهر في الخطة أي سر أو hash)", () => {
    const plan = buildPlan({ today: TODAY });
    for (const t of plan.teachers) {
      expect(t.username).toMatch(/^demo-teacher-\d+@example\.invalid$/);
      expect(Object.keys(t)).not.toContain("password");
    }
    expect(JSON.stringify(plan)).not.toMatch(/password/i);
  });

  it("المزايا: القائمة المطلوبة مفعّلة وواتساب مطفأ", () => {
    for (const key of ["exams", "juz_progress", "messaging", "supervisor_visits", "fees", "auto_assign", "error_grading", "qr_attendance"]) {
      expect(FEATURES_ON).toContain(key);
    }
    expect(FEATURES_OFF).toEqual(["whatsapp"]);
    expect(FEATURES_ON).not.toContain("whatsapp");
  });

  it("أيام الدوام: خلال ٣٠ يوماً، أحد–خميس، تنتهي بالأحدث ولا مستقبل", () => {
    const days = sessionDays(TODAY, 30);
    expect(days.length).toBeGreaterThan(18);
    expect(days.length).toBeLessThanOrEqual(22);
    expect(days.every((d) => weekdayOf(d) <= 4)).toBe(true);
    expect(days[days.length - 1] <= TODAY).toBe(true);
    expect(days[0] >= addDays(TODAY, -29)).toBe(true);
  });

  it("الحضور ≈ ٩٠٪ حاضر، وتتنوع الحالات، وQR فقط للحاضر", () => {
    const plan = buildPlan({ today: TODAY });
    const days = sessionDays(TODAY, 30).length;
    expect(plan.attendance).toHaveLength(plan.students.length * days);
    const attended = plan.attendance.filter((a) => a.status === "present" || a.status === "late").length;
    expect(attended / plan.attendance.length).toBeGreaterThan(0.86);
    expect(attended / plan.attendance.length).toBeLessThan(0.94);
    const kinds = new Set(plan.attendance.map((a) => a.status));
    for (const k of ["present", "late", "excused", "absent"]) expect(kinds.has(k)).toBe(true);
    expect(plan.attendance.filter((a) => a.checkin).every((a) => a.status === "present")).toBe(true);
    const keys = plan.attendance.map((a) => `${a.halaqah}|${a.studentId}|${a.date}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("الأوراد: صفحات صالحة، مقاطع سبقي/منزل، حالات متنوعة، أخطاء على المعتمد فقط", () => {
    const plan = buildPlan({ today: TODAY });
    const keys = plan.wards.map((w) => `${w.halaqah}|${w.studentId}|${w.date}`);
    expect(new Set(keys).size).toBe(keys.length); // مفتاح (حلقة، طالب، تاريخ) فريد لربط المقاطع
    for (const w of plan.wards) {
      if (w.hifzFrom !== null) {
        expect(w.hifzFrom).toBeGreaterThanOrEqual(1);
        expect(w.hifzTo).toBeLessThanOrEqual(TOTAL_PAGES);
        expect(w.hifzFrom).toBeLessThanOrEqual(w.hifzTo);
        expect(w.hifzAyah.fromSurah).toBeLessThanOrEqual(w.hifzAyah.toSurah);
      }
      if (w.errorCounts) {
        expect(w.status).toBe("approved");
        expect(w.errorScore).toBeGreaterThanOrEqual(0);
        expect(w.errorScore).toBeLessThanOrEqual(100);
      }
      for (const seg of w.segments) {
        expect(["sabqi", "manzil"]).toContain(seg.track);
        expect(seg.fromPage).toBeLessThanOrEqual(seg.toPage);
        expect(seg.toPage).toBeLessThanOrEqual(TOTAL_PAGES);
      }
    }
    const statuses = new Set(plan.wards.map((w) => w.status));
    expect(statuses.has("approved")).toBe(true);
    expect(statuses.has("new")).toBe(true);
    const approved = plan.wards.filter((w) => w.status === "approved").length;
    expect(approved / plan.wards.length).toBeGreaterThan(0.75);
    expect(plan.wards.some((w) => w.errorCounts)).toBe(true);
    expect(plan.wards.some((w) => w.segments.some((s) => s.track === "manzil"))).toBe(true);
    expect(plan.wards.every((w) => w.date <= TODAY)).toBe(true);
  });

  it("تقدّم الأجزاء متنوع: اتحاد صفحات الحفظ يغطي من جزء واحد إلى ٣٠", () => {
    const plan = buildPlan({ today: TODAY });
    const covered = new Map();
    for (const w of plan.wards) {
      if (w.hifzFrom === null) continue;
      const set = covered.get(w.studentId) ?? new Set();
      for (let p = w.hifzFrom; p <= w.hifzTo; p++) set.add(p);
      covered.set(w.studentId, set);
    }
    const pages = plan.students.map((s) => covered.get(s.id)?.size ?? 0);
    expect(Math.min(...pages)).toBeLessThanOrEqual(pagesForJuzCount(2));
    expect(Math.max(...pages)).toBeGreaterThanOrEqual(pagesForJuzCount(28));
    expect(new Set(plan.students.map((s) => s.juz)).size).toBeGreaterThan(20);
    expect(pagesForJuzCount(30)).toBe(TOTAL_PAGES);
    expect(pagesForJuzCount(1)).toBe(23);
  });

  it("الرسوم: حالات مدفوع وجزئي ومستحق للشهر الحالي، والمدفوعات متسقة", () => {
    const plan = buildPlan({ today: TODAY });
    expect(plan.fees.every((f) => f.periodLabel === "2026-10")).toBe(true);
    const statuses = new Set(plan.fees.map((f) => f.status));
    for (const s of ["paid", "partial", "due"]) expect(statuses.has(s)).toBe(true);
    for (const f of plan.fees) {
      expect(f.amountPaid).toBeLessThanOrEqual(f.amountDue);
      expect(f.status === "paid" ? f.amountPaid === f.amountDue : true).toBe(true);
      expect(f.status === "due" ? f.amountPaid === 0 : true).toBe(true);
    }
    expect(plan.payments).toHaveLength(plan.fees.filter((f) => f.amountPaid > 0).length);
    const receipts = plan.payments.map((p) => p.receiptNo);
    expect(new Set(receipts).size).toBe(receipts.length);
    expect(plan.payments.every((p) => p.paidAt.slice(0, 10) <= TODAY)).toBe(true);
  });

  it("الاختبارات: نتائج لكل ترشيح منجز، ودرجات النجاح متسقة", () => {
    const plan = buildPlan({ today: TODAY });
    expect(plan.results.length).toBeGreaterThanOrEqual(4);
    expect(plan.nominations.filter((n) => n.status === "done")).toHaveLength(plan.results.length);
    expect(plan.results.some((r) => !r.passed)).toBe(true);
    expect(plan.results.some((r) => r.passed)).toBe(true);
    for (const r of plan.results) expect(r.passed).toBe(r.score >= r.passMark);
  });

  it("زيارة منجزة بدرجات المعايير وأخرى مجدولة بلا درجات", () => {
    const plan = buildPlan({ today: TODAY });
    const done = plan.visits.find((v) => v.status === "done");
    const scheduled = plan.visits.find((v) => v.status === "scheduled");
    expect(done.scores).toHaveLength(7);
    expect(done.scores.every((s) => s.score >= 0 && s.score <= 5)).toBe(true);
    expect(done.overallScore).toBeGreaterThanOrEqual(0);
    expect(scheduled.scores).toHaveLength(0);
    expect(scheduled.scheduledFor > TODAY).toBe(true);
  });

  it("تحويل الصفحات إلى سور/آيات يبقى داخل حدود السور ومرتباً", () => {
    for (let a = 1; a <= TOTAL_PAGES; a += 7) {
      const b = Math.min(TOTAL_PAGES, a + 3);
      const r = pageRangeToAyahs(a, b);
      expect(r.fromSurah).toBeGreaterThanOrEqual(1);
      expect(r.toSurah).toBeLessThanOrEqual(114);
      expect(r.fromAyah).toBeLessThanOrEqual(SURAH_AYAHS[r.fromSurah - 1]);
      expect(r.toAyah).toBeLessThanOrEqual(SURAH_AYAHS[r.toSurah - 1]);
      expect(r.fromSurah < r.toSurah || (r.fromSurah === r.toSurah && r.fromAyah <= r.toAyah)).toBe(true);
    }
    expect(SURAH_START_PAGES).toHaveLength(114);
    expect(SURAH_AYAHS).toHaveLength(114);
  });
});
