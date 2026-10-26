import { describe, expect, it } from "vitest";
import { canReopen, canTeacherRecord, clampBackdateDays, findSameDayDuplicate, initialStatusFor } from "./ward-policy";
import { profileFor } from "./halaqah-stage";
import type { SameDayWard } from "./ward-policy";

/*
  001 T008 — سياسة الورد حسب الفئة: من يسجّل، الحالة الابتدائية، حارس
  التكرار اليومي (FR-005)، وأهلية «طلب إعادة» على المعتمد (FR-009).
  قرار المالك Q1 (ب): كل ورد معتمد يقبل إعادة الفتح — أيّاً كان مسجِّله.
*/

describe("canTeacherRecord — المعلّم يسجّل عن الطالب للابتدائي فقط (FR-003)", () => {
  it("primary فقط", () => {
    expect(canTeacherRecord(profileFor("primary"))).toBe(true);
    expect(canTeacherRecord(profileFor("intermediate"))).toBe(false);
    expect(canTeacherRecord(profileFor("secondary"))).toBe(false);
    expect(canTeacherRecord(profileFor("university"))).toBe(false);
    expect(canTeacherRecord(profileFor(null))).toBe(false);
  });
});

describe("initialStatusFor — الحالة الابتدائية حسب المسجِّل (FR-008)", () => {
  it("المعلّم والطابور: معتمد فوراً؛ الطالب: جديد يمر بالاعتماد", () => {
    expect(initialStatusFor({ recordedVia: "teacher" })).toBe("approved");
    expect(initialStatusFor({ recordedVia: "queue" })).toBe("approved");
    expect(initialStatusFor({ recordedVia: "student" })).toBe("new");
  });
});

describe("findSameDayDuplicate — حارس التكرار اليومي (FR-005)", () => {
  const day = "2026-10-26";
  // حفظ الفيل ١–٥ للعرض في تحذير التكرار — البقية بلا حفظ (hifz/hifzAyah بلا قيمة)
  const FIL = { fromSurah: 105, fromAyah: 1, toSurah: 105, toAyah: 5 } as const;

  it("تسجيل المعلّم: أي ورد قائم بنفس اليوم (طالب أو معلّم) تكرار — يرجع الأقدم", () => {
    const existing: SameDayWard[] = [
      { id: 30, date: day, recordedVia: "teacher", status: "approved", hifz: { from: 603, to: 603 }, hifzAyah: FIL },
      { id: 12, date: day, recordedVia: "student", status: "new", hifz: null, hifzAyah: null },
    ];
    expect(findSameDayDuplicate(existing, { date: day, via: "teacher" })).toEqual({ id: 12, date: day, recordedVia: "student", status: "new", hifz: null, hifzAyah: null });
  });

  it("إرسال الطالب: ورد المعلّم/الطابور يمنعه، وورده هو لا يمنعه", () => {
    const teacherWard: SameDayWard[] = [{ id: 8, date: day, recordedVia: "teacher", status: "approved", hifz: null, hifzAyah: null }];
    expect(findSameDayDuplicate(teacherWard, { date: day, via: "student" })).toEqual(teacherWard[0]);

    const queueWard: SameDayWard[] = [{ id: 9, date: day, recordedVia: "queue", status: "approved", hifz: null, hifzAyah: null }];
    expect(findSameDayDuplicate(queueWard, { date: day, via: "student" })).toEqual(queueWard[0]);

    const ownWard: SameDayWard[] = [{ id: 10, date: day, recordedVia: "student", status: "new", hifz: null, hifzAyah: null }];
    expect(findSameDayDuplicate(ownWard, { date: day, via: "student" })).toBeNull();
  });

  it("ورد needs_revision لا يُعدّ تكراراً — المحاولة المرفوضة تُستأنف بمحاولة جديدة", () => {
    const rejected: SameDayWard[] = [{ id: 11, date: day, recordedVia: "teacher", status: "needs_revision", hifz: null, hifzAyah: null }];
    expect(findSameDayDuplicate(rejected, { date: day, via: "teacher" })).toBeNull();
    expect(findSameDayDuplicate(rejected, { date: day, via: "student" })).toBeNull();
  });

  it("يوم آخر ليس تكراراً، والقائمة الفارغة كذلك", () => {
    const other: SameDayWard[] = [{ id: 13, date: "2026-10-25", recordedVia: "teacher", status: "approved", hifz: null, hifzAyah: null }];
    expect(findSameDayDuplicate(other, { date: day, via: "teacher" })).toBeNull();
    expect(findSameDayDuplicate([], { date: day, via: "teacher" })).toBeNull();
  });
});

describe("canReopen — طلب إعادة على المعتمد (FR-009، قرار المالك Q1 ب)", () => {
  it("كل ورد معتمد يقبل إعادة الفتح — أيّاً كان مسجِّله", () => {
    expect(canReopen({ status: "approved", recordedVia: "teacher" })).toBe(true);
    expect(canReopen({ status: "approved", recordedVia: "queue" })).toBe(true);
    // قرار المالك (ب): أوراد الطالب المعتمدة تُفتح أيضاً، لا تقتصر على معلّم/طابور
    expect(canReopen({ status: "approved", recordedVia: "student" })).toBe(true);
    expect(canReopen({ status: "approved", recordedVia: null })).toBe(true);
  });

  it("غير المعتمد لا يُفتح: new/seen/needs_revision", () => {
    expect(canReopen({ status: "new", recordedVia: "student" })).toBe(false);
    expect(canReopen({ status: "seen", recordedVia: "teacher" })).toBe(false);
    expect(canReopen({ status: "needs_revision", recordedVia: "queue" })).toBe(false);
  });
});

describe("clampBackdateDays — أقصى رجوع بالتاريخ ٣ أيام", () => {
  it("داخل الحد يمر، وخارجه يُقصّ إلى ٣", () => {
    expect(clampBackdateDays(0)).toBe(0);
    expect(clampBackdateDays(2)).toBe(2);
    expect(clampBackdateDays(3)).toBe(3);
    expect(clampBackdateDays(4)).toBe(3);
    expect(clampBackdateDays(100)).toBe(3);
  });

  it("قيمة غير مفهومة أو سالبة: صفر (لا رجوع)", () => {
    expect(clampBackdateDays(-1)).toBe(0);
    expect(clampBackdateDays(-100)).toBe(0);
    expect(clampBackdateDays(NaN)).toBe(0);
    expect(clampBackdateDays(undefined)).toBe(0);
    expect(clampBackdateDays("كثير")).toBe(0);
  });

  it("نص رقمي أو كسر يُقرَّب للأسفل", () => {
    expect(clampBackdateDays("2")).toBe(2);
    expect(clampBackdateDays(2.9)).toBe(2);
  });
});
