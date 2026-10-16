import { describe, expect, it } from "vitest";
import {
  halaqahScore,
  normalizeStudentName,
  programsScore,
  rankHalaqahs,
  rankStudents,
  type HalaqahMetrics,
  type MetricsStudent,
  type StudentPrograms,
} from "@/lib/mosque/honor-board";
import {
  HONOR_BOARD_CACHE_TTL_MS,
  clearHonorBoardCache,
  honorBoardCacheKey,
  readHonorBoardCache,
  storeHonorBoardCache,
} from "@/lib/mosque/honor-board-cache";

/*
  حسابات لوحة الشرف البحتة: تطبيع الأسماء للمطابقة (للسجلات القديمة)، درجة الحلقة والبرامج
  والدرجة المجمّعة، وترتيب الحلقات والطلاب مع تسامح الحلقات المتعذرة.
*/

function metricsStudent(name: string, engagementScore: number, extras: Partial<MetricsStudent> = {}): MetricsStudent {
  return {
    id: `id-${name}`,
    name,
    wards: 0,
    approved: 0,
    attendanceRate: null,
    streak: 0,
    hifzPagesInRange: 0,
    reviewPagesInRange: 0,
    plan: null,
    recitations: { count: 0, avgScore: null },
    engagementScore,
    ...extras,
  };
}

function metricsOf(students: MetricsStudent[], totals: Partial<HalaqahMetrics["totals"]> = {}): HalaqahMetrics {
  return {
    halaqah: { name: "حلقة", teacherName: "معلم", activeStudents: students.length },
    totals: {
      wardsSubmitted: 0,
      wardsApproved: 0,
      attendanceRate: null,
      planOnTrackRatio: null,
      recitations: { count: 0, avgScore: null },
      hifzPagesInRange: 0,
      ...totals,
    },
    students,
  };
}

const programs = (extras: Partial<StudentPrograms> = {}): StudentPrograms => ({
  registrationId: 1,
  studentId: null,
  halaqahId: 10,
  name: "طالب",
  evaluationPercent: null,
  badges: [],
  inFamily: false,
  inCommittee: false,
  activities: 0,
  ...extras,
});

describe("تطبيع الأسماء", () => {
  it("التشكيل والتطويل وصور الألف والياء والتاء المربوطة والفراغات لا تفرّق", () => {
    expect(normalizeStudentName("أَحْـمد بن   علي")).toBe(normalizeStudentName("احمد بن علي"));
    expect(normalizeStudentName("فاطِمة")).toBe(normalizeStudentName("فاطمه"));
    expect(normalizeStudentName("مصطفي")).toBe(normalizeStudentName("مصطفى"));
    expect(normalizeStudentName("إبراهيم")).toBe(normalizeStudentName("ابراهيم"));
    expect(normalizeStudentName("آدم")).toBe(normalizeStudentName("ادم"));
  });

  it("فراغ «عبد الله» اختلاف كتابة لا اختلاف شخص، والاختلاف الحقيقي يبقى", () => {
    expect(normalizeStudentName("عبد الله")).toBe(normalizeStudentName("عبدالله"));
    expect(normalizeStudentName("سعد")).not.toBe(normalizeStudentName("سعدون"));
    expect(normalizeStudentName("محمد علي")).not.toBe(normalizeStudentName("محمد عالي"));
  });
});

describe("درجة الحلقة", () => {
  it("70٪ متوسط التفاعل + 20٪ الحضور + 10٪ الخطة (النسبة 0-1 تُضرب بمئة)", () => {
    const metrics = metricsOf([metricsStudent("أ", 80), metricsStudent("ب", 60)], {
      attendanceRate: 80,
      planOnTrackRatio: 0.6,
    });
    // 70*0.7 + 80*0.2 + 60*0.1 = 71
    expect(halaqahScore(metrics)).toBe(71);
  });

  it("الجزء الغائب (null) يُسقط ووزنه يُعاد توزيعه على الباقي", () => {
    const metrics = metricsOf([metricsStudent("أ", 70)], { attendanceRate: null, planOnTrackRatio: null });
    expect(halaqahScore(metrics)).toBe(70);

    const withAttendance = metricsOf([metricsStudent("أ", 70)], { attendanceRate: 100, planOnTrackRatio: null });
    // (70*0.7 + 100*0.2) / 0.9 = 76.67 → 77
    expect(halaqahScore(withAttendance)).toBe(77);
  });

  it("لا طلاب ولا حضور ولا خطة = درجة مجهولة", () => {
    expect(halaqahScore(metricsOf([]))).toBeNull();
  });
});

describe("ترتيب الحلقات", () => {
  it("تنازلياً بالدرجة، والمتعادلة بترتيب واحد، والمتعذرة أخيراً بلا ترتيب", () => {
    const rows = rankHalaqahs([
      { halaqahId: 10, name: "الفجر", teacherName: "أ", metrics: metricsOf([metricsStudent("ط", 50)]) },
      { halaqahId: 11, name: "العصر", teacherName: "ب", metrics: metricsOf([metricsStudent("ط", 90)]) },
      { halaqahId: 12, name: "المغرب", teacherName: "ج", metrics: metricsOf([metricsStudent("ط", 50)]) },
      { halaqahId: 13, name: "العشاء", teacherName: "د", metrics: null },
    ]);

    expect(rows.map((row) => row.halaqahId)).toEqual([11, 10, 12, 13]);
    expect(rows.map((row) => row.rank)).toEqual([1, 2, 2, null]);
    expect(rows[3]).toMatchObject({ available: false, score: null, activeStudents: null, attendanceRate: null });
  });

  it("مقاييس متاحة بلا درجة (لا طلاب ولا إجماليات) تبقى متاحة بلا ترتيب", () => {
    const rows = rankHalaqahs([
      { halaqahId: 10, name: "الفجر", teacherName: "أ", metrics: metricsOf([metricsStudent("ط", 40)]) },
      { halaqahId: 11, name: "العصر", teacherName: "ب", metrics: metricsOf([]) },
    ]);
    expect(rows[0]).toMatchObject({ halaqahId: 10, rank: 1 });
    expect(rows[1]).toMatchObject({ halaqahId: 11, rank: null, available: true });
  });

  it("اسم المعلّم من المقاييس يغلب، وسقوطها يعيد اسم الجامع المخزَّن", () => {
    const rows = rankHalaqahs([
      { halaqahId: 10, name: "الفجر", teacherName: "من الجامع", metrics: metricsOf([metricsStudent("ط", 40)]) },
      { halaqahId: 11, name: "العصر", teacherName: "من الجامع", metrics: null },
    ]);
    expect(rows[0].teacherName).toBe("معلم");
    expect(rows[1].teacherName).toBe("من الجامع");
  });
});

describe("درجة البرامج", () => {
  it("نصفها التقييم وخُمسها الأوسمة والباقي عضوية وأنشطة (بسقوف)", () => {
    const score = programsScore(
      programs({
        evaluationPercent: 80,
        badges: [{ icon: "⭐", name: "نجم" }, { icon: "🏅", name: "متميز" }, { icon: "📖", name: "حافظ" }, { icon: "🤝", name: "رابع" }],
        inFamily: true,
        inCommittee: true,
        activities: 5,
      }),
    );
    // 80*0.5 + 100*0.2 + 100*0.15 + 100*0.15 = 90 (الوسام الرابع والنشاط الزائد لا يزيدان)
    expect(score).toBe(90);
  });

  it("العضوية نصفها لكل طرف، والمكون الغائب صفر", () => {
    expect(programsScore(programs({ inFamily: true }))).toBe(8); // 50*0.15
    expect(programsScore(programs({}))).toBe(0);
  });
});

describe("ترتيب الطلاب", () => {
  it("المطابقة بالاسم المُطبَّع داخل الحلقة نفسها فقط، والدرجة المجمّعة 70/30", () => {
    const ranking = rankStudents(
      [
        {
          halaqahId: 10,
          name: "الفجر",
          metrics: metricsOf([metricsStudent("عبدـالله", 90), metricsStudent("زيد", 40)]),
        },
        { halaqahId: 11, name: "العصر", metrics: metricsOf([metricsStudent("سعد", 60)]) },
      ],
      [
        programs({ registrationId: 1, halaqahId: 10, name: "عبد الله", evaluationPercent: 80 }),
        // عبد الله آخر بحلقة أخرى لا يُطابق طالب الحلقة 10
        programs({ registrationId: 2, halaqahId: 11, name: "عبد الله" }),
      ],
    );

    const [first, second, third] = ranking.students;
    expect(first).toMatchObject({ name: "عبدـالله", halaqahName: "الفجر", matched: true, rank: 1 });
    expect(first.programsScore).toBe(40); // 80*0.5 فقط
    expect(first.combinedScore).toBe(75); // 90*0.7 + 40*0.3 = 75
    expect(second).toMatchObject({ name: "سعد", matched: false, programsScore: null });
    expect(second.combinedScore).toBe(60); // غير مطابق = التفاعل وحده
    expect(third).toMatchObject({ name: "زيد", combinedScore: 40 });
    expect(ranking.unmatchedCount).toBe(2);
  });

  it("المتساوون بالدرجة يأخذون ترتيباً واحداً والترتيب تنافسي", () => {
    const ranking = rankStudents(
      [{ halaqahId: 10, name: "الفجر", metrics: metricsOf([metricsStudent("أ", 70), metricsStudent("ب", 70), metricsStudent("ج", 80)]) }],
      [],
    );
    expect(ranking.students.map((student) => [student.name, student.rank])).toEqual([
      ["ج", 1],
      ["أ", 2],
      ["ب", 2],
    ]);
  });

  it("درجة تفاعل خارج 0-100 تُقصّ", () => {
    const ranking = rankStudents(
      [{ halaqahId: 10, name: "الفجر", metrics: metricsOf([metricsStudent("أ", 150)]) }],
      [],
    );
    expect(ranking.students[0].engagementScore).toBe(100);
  });
});

describe("كشف لوحة الشرف", () => {
  it("المفتاح: جامع + النطاق المحلول، والقيمة تعيش مدتها ثم تنقضي", () => {
    expect(honorBoardCacheKey(1, "2026-10-10", "2026-10-16")).toBe("1:2026-10-10:2026-10-16");
    expect(honorBoardCacheKey(2, "2026-10-10", "2026-10-16")).not.toBe(honorBoardCacheKey(1, "2026-10-10", "2026-10-16"));
    expect(honorBoardCacheKey(1, "2026-10-03", "2026-10-09")).not.toBe(honorBoardCacheKey(1, "2026-10-10", "2026-10-16"));

    const key = honorBoardCacheKey(7, "2026-10-10", "2026-10-16");
    clearHonorBoardCache();
    expect(readHonorBoardCache(key, 1000)).toBeNull();

    storeHonorBoardCache(key, { marker: true }, 1000);
    expect(readHonorBoardCache<{ marker: boolean }>(key, 1000 + HONOR_BOARD_CACHE_TTL_MS - 1)).toEqual({ marker: true });
    expect(readHonorBoardCache(key, 1000 + HONOR_BOARD_CACHE_TTL_MS)).toBeNull();
    expect(readHonorBoardCache(key, 999)).toBeNull(); // انقضت وحُذفت
  });
});

describe("غموض الأسماء المتطابقة بالحلقة", () => {
  it("اسمان مُطبَّعان متطابقان لا يأخذان درجة برامج أحدهما", () => {
    const halaqahs = [{ halaqahId: 1, name: "ح", metrics: metricsOf([metricsStudent("فاطمة", 40), metricsStudent("فاطمه", 60)]) }];
    const result = rankStudents(halaqahs, [programs({ halaqahId: 1, name: "فاطمة", evaluationPercent: 100 })]);
    expect(result.students.every((s) => !s.matched && s.programsScore === null)).toBe(true);
    expect(result.unmatchedCount).toBe(2);
  });
  it("سجلا برامج بنفس الاسم المُطبَّع = غموض", () => {
    const halaqahs = [{ halaqahId: 1, name: "ح", metrics: metricsOf([metricsStudent("سارة", 50)]) }];
    const result = rankStudents(halaqahs, [
      programs({ registrationId: 1, halaqahId: 1, name: "سارة", evaluationPercent: 100 }),
      programs({ registrationId: 2, halaqahId: 1, name: "ساره", evaluationPercent: 0 }),
    ]);
    expect(result.students[0].matched).toBe(false);
  });
});

describe("المطابقة بمعرّف الطالب الحقيقي", () => {
  const halaqahs = [
    {
      halaqahId: 1,
      name: "ح",
      metrics: metricsOf([metricsStudent("سارة", 50), metricsStudent("سارة محمد", 70)]),
    },
  ];

  it("student_id يطابق تماماً حتى مع اسمين متشابهين أو مختلفين", () => {
    const ranking = rankStudents(halaqahs, [
      programs({ registrationId: 1, studentId: "id-سارة محمد", halaqahId: 1, name: "اسم آخر كلياً", evaluationPercent: 100 }),
    ]);
    const matched = ranking.students.filter((row) => row.matched);
    expect(matched).toHaveLength(1);
    expect(matched[0].name).toBe("سارة محمد");
    expect(ranking.unmatchedCount).toBe(1);
  });

  it("المعرّف لا يتعدّى حدود الحلقة: نفس student_id بحلقة أخرى لا يطابق", () => {
    const ranking = rankStudents(halaqahs, [
      programs({ registrationId: 1, studentId: "id-سارة", halaqahId: 2, name: "سارة" }),
    ]);
    expect(ranking.students.every((row) => !row.matched)).toBe(true);
  });

  it("سجل بمعرّف لا يرجع للاسم، وسجل بلا معرّف (منقول قديم) يطابق بالاسم", () => {
    const withId = rankStudents(halaqahs, [
      programs({ registrationId: 1, studentId: "غائب", halaqahId: 1, name: "سارة" }),
    ]);
    expect(withId.students.every((row) => !row.matched)).toBe(true);

    const legacy = rankStudents(halaqahs, [programs({ registrationId: 2, studentId: null, halaqahId: 1, name: "سارة" })]);
    expect(legacy.students.find((row) => row.name === "سارة")?.matched).toBe(true);
  });
});
