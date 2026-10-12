import { beforeEach, describe, expect, it, vi } from "vitest";
import { currentWeekPeriod } from "@/lib/mosque/report-periods";
import { clearHonorBoardCache } from "@/lib/mosque/honor-board-cache";
import type { HalaqahMetrics } from "@/lib/mosque/honor-board";

/*
  مسار لوحة الشرف: البوابة (401 ثم 404) قبل أي قاعدة، ثم التحقق من الفترة،
  وتسامح الحلقة المتعذرة، والمطابقة بالاسم، والكشف خمس دقائق لكل
  (جامع، فترة محلولة). القاعدة وcanAccessMosque ونظام المعلّم محاكاة.
*/

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listHalaqahs: vi.fn(),
  listPendingStudents: vi.fn(),
  listEvaluationSummaries: vi.fn(),
  listStudentBadgeAwardsBetween: vi.fn(),
  listFamilyMemberLinks: vi.fn(),
  listCommitteeMemberLinks: vi.fn(),
  listActivities: vi.fn(),
}));
vi.mock("@/lib/mosque/halaqat", () => ({ fetchHalaqahMetrics: vi.fn() }));

import { GET } from "@/app/api/mosques/[id]/honor-board/route";
import { canAccessMosque } from "@/lib/mosque/access";
import * as db from "@/lib/mosque/db";
import { fetchHalaqahMetrics } from "@/lib/mosque/halaqat";

const halaqah = (id: number, name: string, code: string) => ({
  id,
  mosqueId: 1,
  halaqahName: name,
  teacherName: `معلم ${name}`,
  inviteCode: code,
  createdAt: "",
});
const pending = (id: number, name: string, halaqahId: number | null, status: "pending" | "assigned" = "assigned") => ({
  id,
  mosqueId: 1,
  name,
  phone: "",
  status,
  halaqahId,
  createdAt: "",
  assignedAt: null,
});

function metricsOf(students: { name: string; engagementScore: number }[], teacher: string): HalaqahMetrics {
  return {
    halaqah: { name: teacher, teacherName: `أ. ${teacher}`, activeStudents: students.length },
    totals: {
      wardsSubmitted: 8,
      wardsApproved: 6,
      attendanceRate: 85,
      planOnTrackRatio: 0.75,
      recitations: { count: 12, avgScore: 90 },
      hifzPagesInRange: 20,
    },
    students: students.map((student, index) => ({
      id: index + 1,
      name: student.name,
      wards: 4,
      approved: 3,
      attendanceRate: 80,
      streak: 5,
      hifzPagesInRange: 2,
      reviewPagesInRange: 1,
      plan: { status: "on_track", progressPct: 60 },
      recitations: { count: 3, avgScore: 88 },
      engagementScore: student.engagementScore,
    })),
  };
}

function ctx() {
  return { params: Promise.resolve({ id: "1" }) } as never;
}

let enabled: Set<string>;

beforeEach(() => {
  vi.resetAllMocks();
  clearHonorBoardCache();
  enabled = new Set(["honor_board", "halaqat", "weekly_evaluation", "badges", "families", "committees", "archive"]);
  vi.mocked(canAccessMosque).mockResolvedValue(true);
  vi.mocked(db.getMosque).mockResolvedValue({ id: 1, name: "جامع النور", city: "جدة", createdAt: "" });
  vi.mocked(db.isFeatureEnabled).mockImplementation(async (_id, key) => enabled.has(key));
  vi.mocked(db.listHalaqahs).mockResolvedValue([halaqah(10, "الفجر", "A"), halaqah(11, "العصر", "B")]);
  vi.mocked(db.listPendingStudents).mockResolvedValue([]);
  vi.mocked(db.listEvaluationSummaries).mockResolvedValue([]);
  vi.mocked(db.listStudentBadgeAwardsBetween).mockResolvedValue([]);
  vi.mocked(db.listFamilyMemberLinks).mockResolvedValue([]);
  vi.mocked(db.listCommitteeMemberLinks).mockResolvedValue([]);
  vi.mocked(db.listActivities).mockResolvedValue([]);
  vi.mocked(fetchHalaqahMetrics).mockResolvedValue(null);
});

describe("البوابة والمدخلات", () => {
  it("مدير جامع آخر = 401 ولا يصل للقاعدة ولا للكشف", async () => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await GET(new Request("http://x?period=this_week"), ctx())).status).toBe(401);
    expect(db.isFeatureEnabled).not.toHaveBeenCalled();
    expect(db.listHalaqahs).not.toHaveBeenCalled();
  });

  it("الميزة معطّلة = 404 حتى مع الصلاحية", async () => {
    enabled.clear();
    expect((await GET(new Request("http://x?period=this_week"), ctx())).status).toBe(404);
    expect(db.listHalaqahs).not.toHaveBeenCalled();
  });

  it("الجامع غير موجود (مع الميزة مفعّلة) = 404", async () => {
    vi.mocked(db.getMosque).mockResolvedValue(null);
    expect((await GET(new Request("http://x?period=this_week"), ctx())).status).toBe(404);
  });

  it("period مجهول = 400، وcustom ناقص أو معكوس = 400", async () => {
    expect((await GET(new Request("http://x?period=year"), ctx())).status).toBe(400);
    expect((await GET(new Request("http://x?period=custom"), ctx())).status).toBe(400);
    expect((await GET(new Request("http://x?period=custom&from=2026-10-05"), ctx())).status).toBe(400);
    expect((await GET(new Request("http:/" + "/x?period=custom&from=2026-10-05&to=2026-10-01"), ctx())).status).toBe(400);
    expect(fetchHalaqahMetrics).not.toHaveBeenCalled();
  });
});

describe("الترتيب والتسامح", () => {
  it("حلقة متعذرة لا ترمي: تظهر بلا ترتيب، والمتاحة تُرتَّب", async () => {
    vi.mocked(fetchHalaqahMetrics).mockImplementation(async (code) =>
      code === "A" ? metricsOf([{ name: "أحمد", engagementScore: 70 }], "الفجر") : null,
    );

    const res = await GET(new Request("http://x?period=this_week"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.halaqahs).toHaveLength(2);
    expect(body.halaqahs[0]).toMatchObject({ name: "الفجر", rank: 1, available: true, score: 74 });
    expect(body.halaqahs[1]).toMatchObject({ name: "العصر", rank: null, available: false, score: null });
    expect(body.students).toEqual([expect.objectContaining({ name: "أحمد", rank: 1, matched: false })]);
  });

  it("المطابقة بالاسم المُطبَّع داخل الحلقة، والدرجة 70/30، والأوسمة تظهر", async () => {
    const week = currentWeekPeriod();
    vi.mocked(fetchHalaqahMetrics).mockImplementation(async (code) =>
      code === "A"
        ? metricsOf([{ name: "عبدـالله", engagementScore: 90 }, { name: "زيد", engagementScore: 40 }], "الفجر")
        : metricsOf([{ name: "سعد", engagementScore: 60 }], "العصر"),
    );
    vi.mocked(db.listPendingStudents).mockResolvedValue([
      pending(1, "عبد الله", 10),
      pending(2, "سعيد", 11), // اسم لا يطابق أحداً
    ]);
    vi.mocked(db.listEvaluationSummaries).mockResolvedValue([{ targetId: 1, name: "عبد الله", total: 40, maxTotal: 50 }]);
    vi.mocked(db.listStudentBadgeAwardsBetween).mockResolvedValue([{ targetId: 1, name: "نجم الأسبوع", icon: "⭐" }]);
    vi.mocked(db.listFamilyMemberLinks).mockResolvedValue([{ familyId: 5, memberKind: "student", memberId: 1, name: "عبد الله" }]);
    vi.mocked(db.listActivities).mockResolvedValue([
      {
        id: 9,
        mosqueId: 1,
        title: "مسابقة",
        description: "",
        activityDate: week.from,
        tagKind: "halaqah",
        tagId: 10,
        tagName: "الفجر",
        createdAt: "",
        photoCount: 0,
        videoCount: 0,
        coverMediaId: null,
      },
      {
        id: 10,
        mosqueId: 1,
        title: "نشاط قديم",
        description: "",
        activityDate: "2020-01-01",
        tagKind: "halaqah",
        tagId: 10,
        tagName: "الفجر",
        createdAt: "",
        photoCount: 0,
        videoCount: 0,
        coverMediaId: null,
      },
    ]);

    const body = await (await GET(new Request("http://x?period=this_week"), ctx())).json();
    expect(body.rankedStudents).toBe(3);
    expect(body.unmatchedCount).toBe(2); // زيد وسعد

    const first = body.students[0];
    expect(first).toMatchObject({ name: "عبدـالله", halaqahName: "الفجر", matched: true, engagementScore: 90 });
    expect(first.badges).toEqual([{ icon: "⭐", name: "نجم الأسبوع" }]);
    // برامج: تقييم 80 (40) + وسام واحد (6.67) + أسرة (7.5) + نشاط واحد (7.5) = 62
    expect(first.programsScore).toBe(62);
    // 90*0.7 + 62*0.3 = 81.6 → 82
    expect(first.combinedScore).toBe(82);
    expect(body.students[1]).toMatchObject({ name: "سعد", programsScore: null, combinedScore: 60 });
    expect(body.students.map((s: { name: string }) => s.name)).toEqual(["عبدـالله", "سعد", "زيد"]);
  });

  it("حلقات الجامع معطّلة = لوحة فارغة، والمزايا الفرعية معطّلة لا تُستعلم", async () => {
    enabled = new Set(["honor_board"]);
    const body = await (await GET(new Request("http://x?period=this_week"), ctx())).json();
    expect(body.halaqahs).toEqual([]);
    expect(body.students).toEqual([]);
    expect(db.listHalaqahs).not.toHaveBeenCalled();
    expect(db.listEvaluationSummaries).not.toHaveBeenCalled();
    expect(db.listStudentBadgeAwardsBetween).not.toHaveBeenCalled();
    expect(db.listFamilyMemberLinks).not.toHaveBeenCalled();
    expect(db.listCommitteeMemberLinks).not.toHaveBeenCalled();
    expect(db.listActivities).not.toHaveBeenCalled();
  });

  it("طلاب بلا توزيع لا يدخلون درجات البرامج", async () => {
    vi.mocked(fetchHalaqahMetrics).mockImplementation(async (code) =>
      code === "A" ? metricsOf([{ name: "أحمد", engagementScore: 50 }], "الفجر") : null,
    );
    vi.mocked(db.listPendingStudents).mockResolvedValue([pending(1, "أحمد", null, "pending")]);

    const body = await (await GET(new Request("http://x?period=this_week"), ctx())).json();
    expect(body.unmatchedCount).toBe(1);
    expect(body.students[0]).toMatchObject({ name: "أحمد", matched: false, combinedScore: 50 });
  });
});

describe("الكشف", () => {
  it("حلقة متعذّرة: الكشف لا يُخزَّن فيُعاد الجلب", async () => {
    vi.mocked(fetchHalaqahMetrics).mockImplementation(async (code) =>
      code === "A" ? metricsOf([{ name: "أحمد", engagementScore: 50 }], "الفجر") : null,
    );
    await GET(new Request("http://x?period=this_week"), ctx());
    const calls = vi.mocked(fetchHalaqahMetrics).mock.calls.length;
    await GET(new Request("http://x?period=this_week"), ctx());
    expect(vi.mocked(fetchHalaqahMetrics).mock.calls.length).toBe(calls * 2);
  });

  it("نفس الجامع والفترة: نداء ثانٍ من الكشف بلا جلب جديد", async () => {
    vi.mocked(fetchHalaqahMetrics).mockImplementation(async () => metricsOf([{ name: "أحمد", engagementScore: 50 }], "الفجر"));
    await GET(new Request("http://x?period=this_week"), ctx());
    const calls = vi.mocked(fetchHalaqahMetrics).mock.calls.length;
    await GET(new Request("http://x?period=this_week"), ctx());
    expect(vi.mocked(fetchHalaqahMetrics).mock.calls.length).toBe(calls);
  });

  it("فترة أخرى أو جامع آخر = مفاتيح مختلفة فتُجلب من جديد", async () => {
    vi.mocked(fetchHalaqahMetrics).mockImplementation(async () => metricsOf([{ name: "أحمد", engagementScore: 50 }], "الفجر"));
    await GET(new Request("http://x?period=this_week"), ctx());
    const calls = vi.mocked(fetchHalaqahMetrics).mock.calls.length;

    await GET(new Request("http://x?period=last_week"), ctx());
    expect(vi.mocked(fetchHalaqahMetrics).mock.calls.length).toBe(calls * 2);

    await GET(new Request("http://x?period=custom&from=2026-10-01&to=2026-10-02"), ctx());
    expect(vi.mocked(fetchHalaqahMetrics).mock.calls.length).toBe(calls * 3);
  });
});
