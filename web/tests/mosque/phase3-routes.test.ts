import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  مسارات المرحلة الثالثة (أوسمة، جدول أسبوعي، تقارير): نفس نمط المرحلة
  الثانية — البوابة (401 ثم 404) قبل أي قاعدة، ثم التحقق من المدخلات
  وتقييد كل شيء بمعرّف الجامع. القاعدة وcanAccessMosque ونظام المعلّم محاكاة.
*/

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(),
  isFeatureEnabled: vi.fn(),
  createBadge: vi.fn(),
  deleteBadge: vi.fn(),
  getBadge: vi.fn(),
  findBadgeTargetName: vi.fn(),
  awardBadge: vi.fn(),
  listBadges: vi.fn(),
  listBadgeAwards: vi.fn(),
  listRecentAwards: vi.fn(),
  listTargetAwards: vi.fn(),
  seedSuggestedBadges: vi.fn(),
  listEvaluationTargets: vi.fn(),
  checkScheduleRef: vi.fn(),
  createScheduleSlot: vi.fn(),
  updateScheduleSlot: vi.fn(),
  deleteScheduleSlot: vi.fn(),
  listScheduleSlots: vi.fn(),
  listHalaqahs: vi.fn(),
  listCommittees: vi.fn(),
  countPendingRegistrations: vi.fn(),
  countFamilies: vi.fn(),
  listCommitteeTaskSummaries: vi.fn(),
  listEvaluationSummaries: vi.fn(),
  countBadgeAwardsBetween: vi.fn(),
  listBadgeTopBetween: vi.fn(),
  countActivitiesBetween: vi.fn(),
}));
vi.mock("@/lib/mosque/halaqat", () => ({ getHalaqahStats: vi.fn(), getMetricsForHalaqah: vi.fn() }));

import { GET as BADGES_GET, POST as BADGES_POST } from "@/app/api/mosques/[id]/badges/route";
import { POST as SUGGESTED_POST } from "@/app/api/mosques/[id]/badges/suggested/route";
import { DELETE as BADGE_DELETE } from "@/app/api/mosques/[id]/badges/[badgeId]/route";
import { POST as AWARD_POST } from "@/app/api/mosques/[id]/badges/[badgeId]/awards/route";
import { GET as SCHEDULE_GET, POST as SCHEDULE_POST } from "@/app/api/mosques/[id]/schedule/route";
import { PATCH as SLOT_PATCH, DELETE as SLOT_DELETE } from "@/app/api/mosques/[id]/schedule/[slotId]/route";
import { GET as PUBLIC_SCHEDULE_GET } from "@/app/api/mosques/[id]/public/schedule/route";
import { GET as REPORTS_GET } from "@/app/api/mosques/[id]/reports/route";
import { canAccessMosque } from "@/lib/mosque/access";
import * as db from "@/lib/mosque/db";
import { getHalaqahStats, getMetricsForHalaqah } from "@/lib/mosque/halaqat";

const badge = { id: 3, mosqueId: 1, name: "نجم الأسبوع", icon: "⭐", description: "", criteriaNote: "", createdAt: "", awardCount: 1 };
const award = {
  id: 77,
  badgeId: 3,
  badgeName: "نجم الأسبوع",
  icon: "⭐",
  targetKind: "student" as const,
  targetId: 7,
  targetName: "أحمد",
  awardedAt: "2026-10-10",
  note: "",
};
const slot = {
  id: 11,
  mosqueId: 1,
  dayOfWeek: 0,
  period: "fajr" as const,
  startTime: "05:30",
  title: "حلقة الفجر",
  programKind: "halaqah" as const,
  refId: 10,
  location: null,
  notes: null,
  createdAt: "",
};
const halaqah = (id: number, name: string) => ({
  id,
  mosqueId: 1,
  halaqahName: name,
  teacherName: `معلم ${name}`,
  createdAt: "",
});

function json(body: unknown, method = "POST") {
  return new Request("http://localhost/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(extra: Record<string, string> = {}) {
  return { params: Promise.resolve({ id: "1", ...extra }) } as never;
}
const slotBody = { dayOfWeek: 0, period: "fajr", startTime: "05:30", title: "حلقة الفجر", programKind: "halaqah", refId: 10 };

let enabled: Set<string>;

beforeEach(() => {
  vi.resetAllMocks();
  enabled = new Set(["badges", "weekly_schedule", "reports", "halaqat", "registration", "families", "committees", "weekly_evaluation"]);
  vi.mocked(canAccessMosque).mockResolvedValue(true);
  vi.mocked(db.getMosque).mockResolvedValue({ id: 1, name: "جامع النور", city: "مكة", createdAt: "" });
  vi.mocked(db.isFeatureEnabled).mockImplementation(async (_id, key) => enabled.has(key));
  vi.mocked(db.getBadge).mockResolvedValue(badge);
  vi.mocked(db.createBadge).mockResolvedValue(badge);
  vi.mocked(db.deleteBadge).mockResolvedValue(true);
  vi.mocked(db.seedSuggestedBadges).mockResolvedValue([badge]);
  vi.mocked(db.findBadgeTargetName).mockResolvedValue("أحمد");
  vi.mocked(db.awardBadge).mockResolvedValue(award);
  vi.mocked(db.listBadges).mockResolvedValue([badge]);
  vi.mocked(db.listRecentAwards).mockResolvedValue([award]);
  vi.mocked(db.listTargetAwards).mockResolvedValue([award]);
  vi.mocked(db.listBadgeAwards).mockResolvedValue([award]);
  vi.mocked(db.listEvaluationTargets).mockResolvedValue([{ id: 5, name: "أسرة النور" }]);
  vi.mocked(db.checkScheduleRef).mockResolvedValue(null);
  vi.mocked(db.createScheduleSlot).mockResolvedValue(slot);
  vi.mocked(db.updateScheduleSlot).mockResolvedValue(slot);
  vi.mocked(db.deleteScheduleSlot).mockResolvedValue(true);
  vi.mocked(db.listScheduleSlots).mockResolvedValue([slot]);
  vi.mocked(db.listHalaqahs).mockResolvedValue([halaqah(10, "الفجر"), halaqah(11, "العصر")]);
  vi.mocked(db.listCommittees).mockResolvedValue([]);
  vi.mocked(db.countPendingRegistrations).mockResolvedValue(2);
  vi.mocked(db.countFamilies).mockResolvedValue(3);
  vi.mocked(db.listCommitteeTaskSummaries).mockResolvedValue([{ id: 7, name: "لجنة الأنشطة", openTasks: 4 }]);
  vi.mocked(db.listEvaluationSummaries).mockResolvedValue([]);
  vi.mocked(db.countBadgeAwardsBetween).mockResolvedValue(6);
  vi.mocked(db.listBadgeTopBetween).mockResolvedValue([{ icon: "⭐", name: "نجم الأسبوع", count: 3 }]);
  vi.mocked(db.countActivitiesBetween).mockResolvedValue(0);
  vi.mocked(getHalaqahStats).mockResolvedValue({ activeStudents: 10, totalPages: 100, avgPages: 10, avgMastery: 80 });
  vi.mocked(getMetricsForHalaqah).mockResolvedValue(null);
});

describe("البوابة: 401 لجامع آخر، 404 لميزة معطّلة", () => {
  const cases: [string, () => Promise<Response>][] = [
    ["badges GET", () => BADGES_GET(new Request("http://x"), ctx())],
    ["badges POST", () => BADGES_POST(json({ name: "وسام" }), ctx())],
    ["badges suggested POST", () => SUGGESTED_POST(new Request("http://x", { method: "POST" }), ctx())],
    ["badge DELETE", () => BADGE_DELETE(new Request("http://x", { method: "DELETE" }), ctx({ badgeId: "3" }))],
    ["award POST", () => AWARD_POST(json({ targetKind: "student", targetId: 7 }), ctx({ badgeId: "3" }))],
    ["schedule GET", () => SCHEDULE_GET(new Request("http://x"), ctx())],
    ["schedule POST", () => SCHEDULE_POST(json(slotBody), ctx())],
    ["slot PATCH", () => SLOT_PATCH(json(slotBody, "PATCH"), ctx({ slotId: "11" }))],
    ["slot DELETE", () => SLOT_DELETE(new Request("http://x", { method: "DELETE" }), ctx({ slotId: "11" }))],
    ["reports GET", () => REPORTS_GET(new Request("http://x?period=this_week"), ctx())],
  ];

  it.each(cases)("%s: مدير جامع آخر = 401 ولا يصل للقاعدة", async (_name, call) => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await call()).status).toBe(401);
    expect(db.isFeatureEnabled).not.toHaveBeenCalled();
    expect(db.createBadge).not.toHaveBeenCalled();
    expect(db.awardBadge).not.toHaveBeenCalled();
    expect(db.createScheduleSlot).not.toHaveBeenCalled();
  });

  it.each(cases)("%s: الميزة معطّلة = 404 حتى مع الصلاحية", async (_name, call) => {
    enabled.clear();
    expect((await call()).status).toBe(404);
    expect(db.createBadge).not.toHaveBeenCalled();
    expect(db.awardBadge).not.toHaveBeenCalled();
    expect(db.createScheduleSlot).not.toHaveBeenCalled();
    expect(db.countFamilies).not.toHaveBeenCalled();
  });

  it("ميزة واحدة لا تفتح مسارات غيرها: badges وحدها لا تفتح الجدول", async () => {
    enabled = new Set(["badges"]);
    expect((await SCHEDULE_GET(new Request("http://x"), ctx())).status).toBe(404);
    expect(db.listScheduleSlots).not.toHaveBeenCalled();
  });

  it("الجامع غير موجود (مع الميزة مفعّلة) = 404", async () => {
    vi.mocked(db.getMosque).mockResolvedValue(null);
    expect((await BADGES_GET(new Request("http://x"), ctx())).status).toBe(404);
    expect(db.listBadges).not.toHaveBeenCalled();
  });
});

describe("الأوسمة", () => {
  it("اسم فارغ = 400، وإلا يُنشأ بالحقول المقلومة والأيقونة الافتراضية", async () => {
    expect((await BADGES_POST(json({ name: "  " }), ctx())).status).toBe(400);

    const res = await BADGES_POST(json({ name: "  متميز  ", icon: "", description: "و", criteriaNote: "ض" }), ctx());
    expect(res.status).toBe(201);
    expect(db.createBadge).toHaveBeenCalledWith(1, { name: "متميز", icon: "🏅", description: "و", criteriaNote: "ض" });
  });

  it("اسم مكرر = 409", async () => {
    vi.mocked(db.createBadge).mockResolvedValue(null);
    expect((await BADGES_POST(json({ name: "نجم الأسبوع" }), ctx())).status).toBe(409);
  });

  it("GET: يعيد الأوسمة وآخر المنح وقوائم الأهداف، ومع target يستعلم أوسامه", async () => {
    const res = await BADGES_GET(new Request("http://x?kind=student&targetId=7"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.target).toEqual({ kind: "student", id: 7, name: "أحمد" });
    expect(db.listTargetAwards).toHaveBeenCalledWith(1, "student", 7);
    expect(db.listRecentAwards).toHaveBeenCalledWith(1);
    expect(body.families).toEqual([{ id: 5, name: "أسرة النور" }]);

    // ميزة الأسر معطّلة = قائمة فارغة بلا استعلام
    enabled.delete("families");
    vi.mocked(db.listEvaluationTargets).mockClear();
    await BADGES_GET(new Request("http://x"), ctx());
    expect(db.listEvaluationTargets).not.toHaveBeenCalled();
  });

  it("GET بمعاملات ناقصة أو هدف غير موجود = 400/404", async () => {
    expect((await BADGES_GET(new Request("http://x?kind=student"), ctx())).status).toBe(400);
    expect((await BADGES_GET(new Request("http://x?kind=teacher&targetId=7"), ctx())).status).toBe(400);

    vi.mocked(db.findBadgeTargetName).mockResolvedValue(null);
    expect((await BADGES_GET(new Request("http://x?kind=student&targetId=999"), ctx())).status).toBe(404);
  });

  it("الاقتراحات والحذف: يستدعي بطاقة الجامع، وغير الموجود = 404", async () => {
    expect((await SUGGESTED_POST(new Request("http://x", { method: "POST" }), ctx())).status).toBe(200);
    expect(db.seedSuggestedBadges).toHaveBeenCalledWith(1);

    expect((await BADGE_DELETE(new Request("http://x", { method: "DELETE" }), ctx({ badgeId: "3" }))).status).toBe(200);
    vi.mocked(db.deleteBadge).mockResolvedValue(false);
    expect((await BADGE_DELETE(new Request("http://x", { method: "DELETE" }), ctx({ badgeId: "3" }))).status).toBe(404);
  });

  it("منح: النوع والهدف والتاريخ كلها تُفحص قبل القاعدة", async () => {
    const call = (body: unknown) => AWARD_POST(json(body), ctx({ badgeId: "3" }));
    expect((await call({ targetKind: "teacher", targetId: 7 })).status).toBe(400);
    for (const targetId of ["abc", 0, -1, 1.5, null]) {
      expect((await call({ targetKind: "student", targetId })).status).toBe(400);
    }
    for (const awardedAt of ["2026-02-30", "غدا", "2026-1-1", 12]) {
      expect((await call({ targetKind: "student", targetId: 7, awardedAt })).status).toBe(400);
    }
    expect(db.awardBadge).not.toHaveBeenCalled();
  });

  it("منح: الوسام غير موجود = 404، والهدف من جامع آخر = 400", async () => {
    vi.mocked(db.getBadge).mockResolvedValue(null);
    expect((await AWARD_POST(json({ targetKind: "student", targetId: 7 }), ctx({ badgeId: "3" }))).status).toBe(404);

    vi.mocked(db.getBadge).mockResolvedValue(badge);
    vi.mocked(db.findBadgeTargetName).mockResolvedValue(null);
    const res = await AWARD_POST(json({ targetKind: "family", targetId: 99 }), ctx({ badgeId: "3" }));
    expect(res.status).toBe(400);
    expect(db.findBadgeTargetName).toHaveBeenCalledWith(1, "family", 99);
    expect(db.awardBadge).not.toHaveBeenCalled();
  });

  it("منح سليم = 201، ومكرر بنفس اليوم = 409، والتاريخ الافتراضي اليوم", async () => {
    const res = await AWARD_POST(
      json({ targetKind: "student", targetId: 7, awardedAt: "2026-10-10", note: "ملاحظة" }),
      ctx({ badgeId: "3" }),
    );
    expect(res.status).toBe(201);
    expect(db.awardBadge).toHaveBeenCalledWith(1, 3, "student", 7, "2026-10-10", "ملاحظة");

    await AWARD_POST(json({ targetKind: "student", targetId: 7 }), ctx({ badgeId: "3" }));
    const defaultDate = vi.mocked(db.awardBadge).mock.calls[1][4];
    expect(defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    vi.mocked(db.awardBadge).mockResolvedValue("duplicate");
    expect((await AWARD_POST(json({ targetKind: "student", targetId: 7 }), ctx({ badgeId: "3" }))).status).toBe(409);
  });
});

describe("الجدول الأسبوعي — التحقق من المدخلات", () => {
  const post = (body: unknown) => SCHEDULE_POST(json(body), ctx());

  it.each([
    ["يوم 7", { ...slotBody, dayOfWeek: 7 }],
    ["يوم -1", { ...slotBody, dayOfWeek: -1 }],
    ["يوم نص", { ...slotBody, dayOfWeek: "x" }],
    ["فترة مجهولة", { ...slotBody, period: "nap" }],
    ["فترة ناقصة", { period: "fajr", title: "ت" }],
    ["وقت بلا صفري بادئ", { ...slotBody, startTime: "5:30" }],
    ["وقت 25 ساعة", { ...slotBody, startTime: "25:00" }],
    ["وقت 60 دقيقة", { ...slotBody, startTime: "12:60" }],
    ["عنوان فارغ", { ...slotBody, title: "   " }],
    ["نوع برنامج مجهول", { ...slotBody, programKind: "party" }],
    ["refId بلا ربط صالح", { ...slotBody, programKind: "lecture", refId: 10 }],
    ["refId غير رقمي", { ...slotBody, refId: "abc" }],
    ["refId صفر", { ...slotBody, refId: 0 }],
  ])("%s = 400 ولا كتابة", async (_name, body) => {
    expect((await post(body)).status).toBe(400);
    expect(db.createScheduleSlot).not.toHaveBeenCalled();
  });

  it("خانة سليمة = 201 بالحقول كما صحّحت (وقت فارغ = null، ref يمر)", async () => {
    const res = await post({ ...slotBody, startTime: "", location: "  المصلى  ", notes: "" });
    expect(res.status).toBe(201);
    expect(db.createScheduleSlot).toHaveBeenCalledWith(1, {
      dayOfWeek: 0,
      period: "fajr",
      startTime: null,
      title: "حلقة الفجر",
      programKind: "halaqah",
      refId: 10,
      location: "المصلى",
      notes: null,
    });
  });

  it("programKind ناقص = other، وref_id حينها يُرفض", async () => {
    expect((await post({ dayOfWeek: 3, period: "other", title: "محاضرة" })).status).toBe(201);
    expect(vi.mocked(db.createScheduleSlot).mock.calls[0][1].programKind).toBe("other");
    expect((await post({ dayOfWeek: 3, period: "other", title: "محاضرة", refId: 10 })).status).toBe(400);
  });

  it("ref_id لكيان من جامع آخر = 400 (يفحصه checkScheduleRef)", async () => {
    vi.mocked(db.checkScheduleRef).mockResolvedValue("المرتبط ليس من هذا الجامع");
    expect((await post(slotBody)).status).toBe(400);
    expect(db.createScheduleSlot).not.toHaveBeenCalled();
  });

  it("PATCH: غير موجودة = 404، وسليمة = 200", async () => {
    const c = ctx({ slotId: "11" });
    vi.mocked(db.updateScheduleSlot).mockResolvedValue(null);
    expect((await SLOT_PATCH(json(slotBody, "PATCH"), c)).status).toBe(404);

    vi.mocked(db.updateScheduleSlot).mockResolvedValue(slot);
    expect((await SLOT_PATCH(json(slotBody, "PATCH"), c)).status).toBe(200);
    expect(db.updateScheduleSlot).toHaveBeenCalledWith(1, 11, expect.objectContaining({ dayOfWeek: 0 }));
  });

  it("DELETE: غير موجودة = 404، وسليمة = ok", async () => {
    const c = ctx({ slotId: "11" });
    vi.mocked(db.deleteScheduleSlot).mockResolvedValue(false);
    expect((await SLOT_DELETE(new Request("http://x", { method: "DELETE" }), c)).status).toBe(404);

    vi.mocked(db.deleteScheduleSlot).mockResolvedValue(true);
    expect((await SLOT_DELETE(new Request("http://x", { method: "DELETE" }), c)).status).toBe(200);
    expect(db.deleteScheduleSlot).toHaveBeenCalledWith(1, 11);
  });

  it("GET: الخانات + قوائم الربط مقيدة بمزاياها", async () => {
    const res = await SCHEDULE_GET(new Request("http://x"), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slots).toEqual([slot]);
    expect(body.refs.halaqahs).toEqual([{ id: 10, name: "الفجر" }, { id: 11, name: "العصر" }]);
    expect(body.refs.families).toEqual([{ id: 5, name: "أسرة النور" }]);

    enabled.delete("halaqat");
    enabled.delete("families");
    const after = (await (await SCHEDULE_GET(new Request("http://x"), ctx())).json()) as { refs: { halaqahs: unknown[]; families: unknown[] } };
    expect(after.refs.halaqahs).toEqual([]);
    expect(after.refs.families).toEqual([]);
  });
});

describe("الجدول العام (بلا صلاحية)", () => {
  const get = (id = "1") => PUBLIC_SCHEDULE_GET(new Request("http://x"), { params: Promise.resolve({ id }) } as never);

  it("معرّف غير صالح أو جامع غير موجود أو ميزة معطّلة = 404", async () => {
    for (const id of ["abc", "0", "-1", "1.5"]) expect((await get(id)).status).toBe(404);

    vi.mocked(db.getMosque).mockResolvedValue(null);
    expect((await get()).status).toBe(404);

    vi.mocked(db.getMosque).mockResolvedValue({ id: 1, name: "جامع النور", city: "", createdAt: "" });
    enabled.delete("weekly_schedule");
    expect((await get()).status).toBe(404);
    expect(db.listScheduleSlots).not.toHaveBeenCalled();
  });

  it("ميزة مفعّلة: الاسم والخانات للعموم حتى بلا جلسة، والطلاب مقيدون بالجامع", async () => {
    vi.mocked(canAccessMosque).mockResolvedValue(false); // زائر بلا دخول
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("جامع النور");
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0]).not.toHaveProperty("mosqueId");
    expect(body.slots[0]).not.toHaveProperty("refId");
    expect(body.slots[0]).not.toHaveProperty("createdAt");
    expect(body.slots[0].title).toBe(slot.title);
    expect(db.listScheduleSlots).toHaveBeenCalledWith(1);
  });
});

describe("التقارير", () => {
  const get = (query = "period=this_week") => REPORTS_GET(new Request(`http://x?${query}`), ctx());

  it("period مجهول = 400، وcustom ناقص أو معكوس = 400", async () => {
    expect((await get("period=year")).status).toBe(400);
    expect((await get("period=custom")).status).toBe(400);
    expect((await get("period=custom&from=2026-10-01")).status).toBe(400);
    expect((await get("period=custom&from=2026-10-05&to=2026-10-01")).status).toBe(400);
    expect((await get("period=custom&from=2026-02-30&to=2026-03-01")).status).toBe(400);
  });

  it("هذا الأسبوع: من سبت لجمعة، والاستعلامات تمر بالنطاق نفسه", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(new Date(`${body.period.from}T00:00:00Z`).getUTCDay()).toBe(6);
    expect(body.period.to > body.period.from).toBe(true);
    expect(db.listEvaluationSummaries).toHaveBeenCalledWith(1, body.period.from, body.period.to, "family");
    expect(db.listEvaluationSummaries).toHaveBeenCalledWith(1, body.period.from, body.period.to, "student");
    expect(db.countBadgeAwardsBetween).toHaveBeenCalledWith(1, body.period.from, body.period.to);
  });

  it("الشهر الهجري: نطاق لا يتجاوز 31 يوماً", async () => {
    const body = await (await get("period=hijri_month")).json();
    const { from, to } = body.period as { from: string; to: string };
    const days = (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000 + 1;
    expect(days).toBeGreaterThan(0);
    expect(days).toBeLessThanOrEqual(31);
  });

  it("custom سليم يمر كما هو", async () => {
    const body = await (await get("period=custom&from=2026-10-01&to=2026-10-31")).json();
    expect(body.period).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("المؤشرات: حلقة تعذرت تُستثنى، والمتوسط والأنشطة المحروسة", async () => {
    vi.mocked(getHalaqahStats).mockImplementation(async (id) => {
      if (id !== 10) throw new Error("down");
      return { activeStudents: 10, totalPages: 100, avgPages: 10, avgMastery: 80 };
    });
    vi.mocked(db.listEvaluationSummaries).mockImplementation(async (_id, _from, _to, kind) =>
      kind === "family" ? [{ targetId: 5, name: "أسرة النور", total: 40, maxTotal: 50 }] : [],
    );

    const body = await (await get()).json();
    expect(body.kpis.halaqatCount).toBe(2);
    expect(body.kpis.activeStudents).toBe(10);
    expect(body.kpis.unreachableHalaqat).toBe(1);
    expect(body.kpis.evaluationsAvgPercent).toBe(80);
    expect(body.kpis.familiesCount).toBe(3);
    expect(body.kpis.openTasks).toBe(4);
    expect(body.kpis.pendingRegistrations).toBe(2);
    expect(body.kpis.badgesAwarded).toBe(6);
    expect(body.kpis.activities).toBeNull(); // جدول الأنشطة غير منشور
    expect(body.topFamilies[0]).toMatchObject({ name: "أسرة النور", total: 40, percent: 80 });
    expect(body.enabled.badges).toBe(true);
  });

  it("ميزات فرعية معطّلة: أقسامها تُتخطى ولا تُستعلم", async () => {
    enabled = new Set(["reports", "halaqat"]);
    const body = await (await get()).json();
    expect(body.enabled.families).toBe(false);
    expect(body.kpis.familiesCount).toBe(0);
    expect(body.kpis.badgesAwarded).toBe(0);
    expect(body.topFamilies).toEqual([]);
    expect(db.countFamilies).not.toHaveBeenCalled();
    expect(db.countBadgeAwardsBetween).not.toHaveBeenCalled();
    expect(db.listEvaluationSummaries).not.toHaveBeenCalled();
  });
});

describe("معاملات المسار غير الصالحة = 404 قبل أي وصول للقاعدة", () => {
  const bad = ["abc", "0", "-1", "1.5", "1e3", "", "99999999999999999999"];
  const cases: [string, (v: string) => Promise<Response>][] = [
    ["mosque id", (v) => BADGES_GET(new Request("http://x"), { params: Promise.resolve({ id: v }) } as never)],
    ["badgeId", (v) => BADGE_DELETE(new Request("http://x", { method: "DELETE" }), ctx({ badgeId: v }))],
    ["badgeId (award)", (v) => AWARD_POST(json({ targetKind: "student", targetId: 7 }), ctx({ badgeId: v }))],
    ["slotId (patch)", (v) => SLOT_PATCH(json(slotBody, "PATCH"), ctx({ slotId: v }))],
    ["slotId (delete)", (v) => SLOT_DELETE(new Request("http://x", { method: "DELETE" }), ctx({ slotId: v }))],
  ];
  for (const [name, call] of cases) {
    it.each(bad)(`${name}: "%s" = 404`, async (v) => {
      expect((await call(v)).status).toBe(404);
      expect(db.getBadge).not.toHaveBeenCalled();
      expect(db.updateScheduleSlot).not.toHaveBeenCalled();
      expect(db.deleteScheduleSlot).not.toHaveBeenCalled();
    });
  }
});
