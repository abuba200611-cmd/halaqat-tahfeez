import { describe, expect, it } from "vitest";
import {
  buildUniqueCodeIndex,
  emptyMergeIdMaps,
  isDemoInviteCode,
  matchHalaqahByInviteCode,
  matchMosqueByNameCity,
  remapActivityTag,
  remapBadgeTargetId,
  remapEvaluationTargetId,
  remapMemberId,
  remapScheduleRef,
  resolveRegistrationAssignment,
  splitPendingRows,
  type MergeIdMaps,
} from "./merge-map";

/** خرائط مقتضبة للاختبار: جامع ١→١٠٠، حلقة المصدر ١٠→الحقيقية ٧ ... */
function testMaps(): MergeIdMaps {
  const maps = emptyMergeIdMaps();
  maps.mosques.set(1, 100);
  maps.halaqahs.set(10, 7);
  maps.pendingStudents.set(20, 300);
  maps.mosqueMembers.set(30, 400);
  maps.families.set(40, 500);
  maps.committees.set(50, 600);
  return maps;
}

describe("buildUniqueCodeIndex — فهرس الرموز", () => {
  it("الرمز الفريد يدخل والرموز الخالية تُهمل", () => {
    const index = buildUniqueCodeIndex([
      { id: 1, code: "ABC" },
      { id: 2, code: null },
      { id: 3, code: "XYZ" },
    ]);
    expect(index.get("ABC")).toBe(1);
    expect(index.get("XYZ")).toBe(3);
    expect(index.has("")).toBe(false);
  });

  it("الرمز المكرر يُستبعد كلياً (غامض)", () => {
    const index = buildUniqueCodeIndex([
      { id: 1, code: "ABC" },
      { id: 2, code: "ABC" },
      { id: 3, code: "ABC" },
    ]);
    expect(index.has("ABC")).toBe(false);
  });
});

describe("matchHalaqahByInviteCode — مطابقة الحلقات بالرمز", () => {
  const student = new Map([["ABC", 7]]);
  const teacher = new Map([["TCH", 9]]);

  it("رمز الطلاب مقدم على رمز المعلّمين", () => {
    const both = new Map([["ABC", 8]]);
    expect(matchHalaqahByInviteCode("ABC", student, both)).toEqual({ targetId: 7, via: "invite_code" });
  });

  it("يسقط إلى رمز المعلّمين عند غياب رمز الطلاب", () => {
    expect(matchHalaqahByInviteCode("TCH", student, teacher)).toEqual({ targetId: 9, via: "teacher_invite_code" });
  });

  it("بلا رمز أو بلا نظير → null", () => {
    expect(matchHalaqahByInviteCode(null, student, teacher)).toBeNull();
    expect(matchHalaqahByInviteCode("NOPE", student, teacher)).toBeNull();
  });
});

describe("isDemoInviteCode — رموز العرض", () => {
  it("DEMO- بأي حالة حروف، ولا غيرها", () => {
    expect(isDemoInviteCode("DEMO-123")).toBe(true);
    expect(isDemoInviteCode("demo-x")).toBe(true);
    expect(isDemoInviteCode("ABC123")).toBe(false);
    expect(isDemoInviteCode(null)).toBe(false);
  });
});

describe("matchMosqueByNameCity — مطابقة الجوامع", () => {
  const target = [
    { id: 1, name: "جامع النور", city: "الرياض" },
    { id: 2, name: "جامع النور", city: "مكة" },
  ];

  it("تطابق تام بالاسم والمدينة", () => {
    expect(matchMosqueByNameCity("جامع النور", "مكة", target)).toBe(2);
  });

  it("مدينة مختلفة أو اسم مختلف → null (إدراج جديد)", () => {
    expect(matchMosqueByNameCity("جامع النور", "المدينة", target)).toBeNull();
    expect(matchMosqueByNameCity("جامع الفجر", "الرياض", target)).toBeNull();
  });

  it("تطابقان غامضان → null لا ربط عشوائياً، ولا تطابق قطعي بالحروف", () => {
    const duplicated = [...target, { id: 3, name: "جامع النور", city: "الرياض" }];
    expect(matchMosqueByNameCity("جامع النور", "الرياض", duplicated)).toBeNull();
    expect(matchMosqueByNameCity("جامع النور ", "الرياض", target)).toBeNull();
  });
});

describe("إعادة رسم المعرّفات بالنوع", () => {
  const maps = testMaps();

  it("member: الطالب من التسجيلات والحرّ من الأعضاء، والمجهول null", () => {
    expect(remapMemberId("student", 20, maps)).toBe(300);
    expect(remapMemberId("member", 30, maps)).toBe(400);
    expect(remapMemberId("student", 999, maps)).toBeNull();
  });

  it("evaluation: الأسرة أو الطالب", () => {
    expect(remapEvaluationTargetId("family", 40, maps)).toBe(500);
    expect(remapEvaluationTargetId("student", 20, maps)).toBe(300);
    expect(remapEvaluationTargetId("family", 999, maps)).toBeNull();
  });

  it("badge: الطالب أو الأسرة أو العضو الحر", () => {
    expect(remapBadgeTargetId("student", 20, maps)).toBe(300);
    expect(remapBadgeTargetId("family", 40, maps)).toBe(500);
    expect(remapBadgeTargetId("member", 30, maps)).toBe(400);
    expect(remapBadgeTargetId("member", 999, maps)).toBeNull();
  });
});

describe("remapActivityTag — وسم النشاط", () => {
  it("الحلقة والأسرة واللجنة تُرسم لنظيرها", () => {
    const maps = testMaps();
    expect(remapActivityTag("halaqah", 10, maps)).toEqual({ tagKind: "halaqah", tagId: 7 });
    expect(remapActivityTag("family", 40, maps)).toEqual({ tagKind: "family", tagId: 500 });
    expect(remapActivityTag("committee", 50, maps)).toEqual({ tagKind: "committee", tagId: 600 });
  });

  it("حلقة بلا نظير (DEMO) → النشاط يبقى بلا وسم", () => {
    expect(remapActivityTag("halaqah", 999, testMaps())).toEqual({ tagKind: null, tagId: null });
    expect(remapActivityTag(null, null, testMaps())).toEqual({ tagKind: null, tagId: null });
  });
});

describe("remapScheduleRef — رابط خانة الجدول", () => {
  it("الأنواع المرتبطة تُرسم، والبرامج الحرة تمر كما هي", () => {
    const maps = testMaps();
    expect(remapScheduleRef("halaqah", 10, maps)).toBe(7);
    expect(remapScheduleRef("family", 40, maps)).toBe(500);
    expect(remapScheduleRef("committee", 50, maps)).toBe(600);
    expect(remapScheduleRef("lecture", 77, maps)).toBe(77);
    expect(remapScheduleRef("other", null, maps)).toBeNull();
  });

  it("حلقة بلا نظير → الخانة تبقى بلا رابط", () => {
    expect(remapScheduleRef("halaqah", 999, testMaps())).toBeNull();
  });
});

describe("resolveRegistrationAssignment — توزيع التسجيل", () => {
  it("حلقة مطابَقة → الحالة كما هي بالمعرّف الجديد", () => {
    expect(
      resolveRegistrationAssignment({ halaqahId: 10, status: "assigned", assignedAt: "2026-10-01" }, 7),
    ).toEqual({ halaqahId: 7, status: "assigned", assignedAt: "2026-10-01" });
  });

  it("حلقة بلا نظير → غير موزَّع: pending بلا وقت توزيع", () => {
    expect(
      resolveRegistrationAssignment({ halaqahId: 10, status: "assigned", assignedAt: "2026-10-01" }, null),
    ).toEqual({ halaqahId: null, status: "pending", assignedAt: null });
  });

  it("تسجيل أصلاً غير موزَّع يبقى كما هو", () => {
    expect(
      resolveRegistrationAssignment({ halaqahId: null, status: "pending", assignedAt: null }, null),
    ).toEqual({ halaqahId: null, status: "pending", assignedAt: null });
  });
});

describe("splitPendingRows — إعادة التشغيل", () => {
  const rows = [{ id: 1, v: "أ" }, { id: 2, v: "ب" }, { id: 3, v: "ج" }];

  it("ما سُجِّل سابقاً يُتخطى والباقي للنقل", () => {
    const existing = new Map([[2, 20]]);
    const { toCopy, alreadyCopied } = splitPendingRows(rows, existing);
    expect(toCopy.map((r) => r.id)).toEqual([1, 3]);
    expect(alreadyCopied.map((r) => r.id)).toEqual([2]);
  });

  it("خريطة فارغة → الكل للنقل، وخريطة كاملة → لا شيء", () => {
    expect(splitPendingRows(rows, new Map()).toCopy).toHaveLength(3);
    const full = new Map(rows.map((r) => [r.id, r.id * 10]));
    expect(splitPendingRows(rows, full).toCopy).toHaveLength(0);
    expect(splitPendingRows(rows, full).alreadyCopied).toHaveLength(3);
  });
});
