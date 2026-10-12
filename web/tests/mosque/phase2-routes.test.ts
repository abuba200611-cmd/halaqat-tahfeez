import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  مسارات المرحلة الثانية (أسر، لجان، تقييم أسبوعي): كلها تمر ببوابة
  واحدة — 401 لمن لا يصل للجامع، 404 للميزة المعطّلة — ثم تحقق المدخلات
  وتقييد كل استدعاء بمعرّف الجامع. القاعدة وcanAccessMosque محاكيان.
*/

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listFamilies: vi.fn(),
  createFamily: vi.fn(),
  getFamily: vi.fn(),
  findMemberName: vi.fn(),
  addFamilyMember: vi.fn(),
  listCommittees: vi.fn(),
  createCommitteeTask: vi.fn(),
  setCommitteeTaskStatus: vi.fn(),
  listCriteria: vi.fn(),
  createCriterion: vi.fn(),
  updateCriterion: vi.fn(),
  seedSuggestedCriteria: vi.fn(),
  listEvaluationTargets: vi.fn(),
  listWeekEvaluations: vi.fn(),
  upsertEvaluations: vi.fn(),
}));

import { GET as FAMILIES_GET, POST as FAMILIES_POST } from "@/app/api/mosques/[id]/families/route";
import { POST as FAMILY_MEMBERS_POST } from "@/app/api/mosques/[id]/families/[familyId]/members/route";
import { GET as COMMITTEES_GET } from "@/app/api/mosques/[id]/committees/route";
import { POST as TASKS_POST } from "@/app/api/mosques/[id]/committees/[committeeId]/tasks/route";
import { PATCH as TASK_PATCH } from "@/app/api/mosques/[id]/committees/[committeeId]/tasks/[taskId]/route";
import { GET as EVAL_GET, PUT as EVAL_PUT } from "@/app/api/mosques/[id]/evaluation/route";
import { PATCH as CRITERION_PATCH } from "@/app/api/mosques/[id]/evaluation/criteria/[criterionId]/route";
import { POST as CRITERIA_POST } from "@/app/api/mosques/[id]/evaluation/criteria/route";
import { canAccessMosque } from "@/lib/mosque/access";
import * as db from "@/lib/mosque/db";

const WEEK = "2026-10-10"; // سبت

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
const family = { id: 5, mosqueId: 1, name: "أ", leaderName: "", notes: "", createdAt: "", memberCount: 0 };
const task = { id: 1, committeeId: 3, title: "ت", status: "doing" as const, dueDate: null, createdAt: "" };

let enabled: Set<string>;

beforeEach(() => {
  vi.resetAllMocks();
  enabled = new Set(["families", "committees", "weekly_evaluation"]);
  vi.mocked(canAccessMosque).mockResolvedValue(true);
  vi.mocked(db.getMosque).mockResolvedValue({ id: 1, name: "جامع", city: "", createdAt: "" });
  vi.mocked(db.isFeatureEnabled).mockImplementation(async (_id, key) => enabled.has(key));
  vi.mocked(db.listCriteria).mockResolvedValue([
    { id: 1, mosqueId: 1, name: "الحضور", maxScore: 10, sortOrder: 1, active: true, createdAt: "" },
    { id: 2, mosqueId: 1, name: "الحفظ", maxScore: 5, sortOrder: 2, active: true, createdAt: "" },
  ]);
  vi.mocked(db.listEvaluationTargets).mockResolvedValue([{ id: 7, name: "أسرة النور" }]);
});

describe("البوابة: 401 لجامع آخر، 404 لميزة معطّلة", () => {
  const cases: [string, () => Promise<Response>][] = [
    ["families GET", () => FAMILIES_GET(new Request("http://x"), ctx())],
    ["families POST", () => FAMILIES_POST(json({ name: "أ" }), ctx())],
    ["committees GET", () => COMMITTEES_GET(new Request("http://x"), ctx())],
    ["evaluation GET", () => EVAL_GET(new Request(`http://x?week=${WEEK}&kind=family`), ctx())],
    ["evaluation PUT", () => EVAL_PUT(json({ week: WEEK, kind: "family", entries: [] }, "PUT"), ctx())],
    ["criteria POST", () => CRITERIA_POST(json({ name: "س" }), ctx())],
    ["task PATCH", () => TASK_PATCH(json({ status: "done" }, "PATCH"), ctx({ committeeId: "1", taskId: "1" }))],
  ];

  it.each(cases)("%s: مدير جامع آخر = 401 ولا يصل للقاعدة", async (_name, call) => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await call()).status).toBe(401);
    expect(db.isFeatureEnabled).not.toHaveBeenCalled();
    expect(db.createFamily).not.toHaveBeenCalled();
    expect(db.upsertEvaluations).not.toHaveBeenCalled();
  });

  it.each(cases)("%s: الميزة معطّلة = 404 حتى مع الصلاحية", async (_name, call) => {
    enabled.clear();
    expect((await call()).status).toBe(404);
    expect(db.createFamily).not.toHaveBeenCalled();
    expect(db.setCommitteeTaskStatus).not.toHaveBeenCalled();
    expect(db.upsertEvaluations).not.toHaveBeenCalled();
  });

  it("ميزة اللجان وحدها لا تفتح مسارات الأسر", async () => {
    enabled = new Set(["committees"]);
    expect((await FAMILIES_GET(new Request("http://x"), ctx())).status).toBe(404);
    expect(db.listFamilies).not.toHaveBeenCalled();
  });
});

describe("الأسر", () => {
  it("اسم فارغ = 400، وإلا يُنشأ مقيّداً بالجامع ومقصوصاً", async () => {
    expect((await FAMILIES_POST(json({ name: "   " }), ctx())).status).toBe(400);
    vi.mocked(db.createFamily).mockResolvedValue(family);
    const res = await FAMILIES_POST(json({ name: "  أسرة  ", leaderName: "خ".repeat(500) }), ctx());
    expect(res.status).toBe(201);
    const [mosqueId, input] = vi.mocked(db.createFamily).mock.calls[0];
    expect(mosqueId).toBe(1);
    expect(input.name).toBe("أسرة");
    expect(input.leaderName).toHaveLength(100);
  });

  it("إضافة فرد ليس من هذا الجامع = 400، ومكرر = 409", async () => {
    vi.mocked(db.getFamily).mockResolvedValue(family);
    const call = () => FAMILY_MEMBERS_POST(json({ memberKind: "student", memberId: 9 }), ctx({ familyId: "5" }));

    vi.mocked(db.findMemberName).mockResolvedValue(null);
    expect((await call()).status).toBe(400);
    expect(db.findMemberName).toHaveBeenCalledWith(1, "student", 9);
    expect(db.addFamilyMember).not.toHaveBeenCalled();

    vi.mocked(db.findMemberName).mockResolvedValue("أحمد");
    vi.mocked(db.addFamilyMember).mockResolvedValue(false);
    expect((await call()).status).toBe(409);

    vi.mocked(db.addFamilyMember).mockResolvedValue(true);
    expect((await call()).status).toBe(201);
  });

  it("نوع فرد غير معروف = 400", async () => {
    vi.mocked(db.getFamily).mockResolvedValue(family);
    const res = await FAMILY_MEMBERS_POST(json({ memberKind: "teacher", memberId: 1 }), ctx({ familyId: "5" }));
    expect(res.status).toBe(400);
  });
});

describe("مهام اللجان", () => {
  it("حالة غير صالحة = 400 ولا تحديث", async () => {
    for (const status of ["finished", "", 1, null, undefined]) {
      const res = await TASK_PATCH(json({ status }, "PATCH"), ctx({ committeeId: "3", taskId: "1" }));
      expect(res.status).toBe(400);
    }
    expect(db.setCommitteeTaskStatus).not.toHaveBeenCalled();
  });

  it("todo/doing/done مقبولة ومقيّدة بالجامع واللجنة", async () => {
    vi.mocked(db.setCommitteeTaskStatus).mockResolvedValue(task);
    for (const status of ["todo", "doing", "done"]) {
      const res = await TASK_PATCH(json({ status }, "PATCH"), ctx({ committeeId: "3", taskId: "1" }));
      expect(res.status).toBe(200);
    }
    expect(db.setCommitteeTaskStatus).toHaveBeenLastCalledWith(1, 3, 1, "done");
  });

  it("مهمة غير موجودة بهذه اللجنة = 404", async () => {
    vi.mocked(db.setCommitteeTaskStatus).mockResolvedValue(null);
    const res = await TASK_PATCH(json({ status: "done" }, "PATCH"), ctx({ committeeId: "3", taskId: "99" }));
    expect(res.status).toBe(404);
  });

  it("تاريخ استحقاق غير صالح = 400، وعنوان فارغ = 400", async () => {
    const c = ctx({ committeeId: "3" });
    expect((await TASKS_POST(json({ title: "م", dueDate: "2026-02-30" }), c)).status).toBe(400);
    expect((await TASKS_POST(json({ title: "م", dueDate: "غدا" }), c)).status).toBe(400);
    expect((await TASKS_POST(json({ title: " " }), c)).status).toBe(400);
    expect(db.createCommitteeTask).not.toHaveBeenCalled();

    vi.mocked(db.createCommitteeTask).mockResolvedValue(task);
    expect((await TASKS_POST(json({ title: "م", dueDate: "2026-10-20" }), c)).status).toBe(201);
    expect(db.createCommitteeTask).toHaveBeenCalledWith(1, 3, { title: "م", dueDate: "2026-10-20" });
  });
});

describe("التقييم الأسبوعي", () => {
  const put = (entries: unknown[], week = WEEK, kind = "family") =>
    EVAL_PUT(json({ week, kind, entries }, "PUT"), ctx());

  it("درجة داخل المجال تُحفظ upsert بمفتاح الجامع", async () => {
    const res = await put([
      { targetId: 7, criterionId: 1, score: 10 },
      { targetId: 7, criterionId: 2, score: 0, note: "ملاحظة" },
    ]);
    expect(res.status).toBe(200);
    expect(db.upsertEvaluations).toHaveBeenCalledWith(1, WEEK, "family", [
      { targetId: 7, criterionId: 1, score: 10, note: "" },
      { targetId: 7, criterionId: 2, score: 0, note: "ملاحظة" },
    ]);
  });

  it.each([
    ["أكبر من الدرجة العظمى", { targetId: 7, criterionId: 2, score: 6 }],
    ["سالبة", { targetId: 7, criterionId: 1, score: -1 }],
    ["كسرية", { targetId: 7, criterionId: 1, score: 2.5 }],
    ["نص", { targetId: 7, criterionId: 1, score: "abc" }],
    ["فارغة", { targetId: 7, criterionId: 1, score: "" }],
    ["هدف من جامع آخر", { targetId: 999, criterionId: 1, score: 5 }],
    ["معيار من جامع آخر", { targetId: 7, criterionId: 999, score: 5 }],
  ])("%s = 400 ولا حفظ جزئي", async (_name, bad) => {
    const res = await put([{ targetId: 7, criterionId: 1, score: 3 }, bad]);
    expect(res.status).toBe(400);
    expect(db.upsertEvaluations).not.toHaveBeenCalled();
  });

  it("حدّ الدرجة بحسب معيارها: 5 مقبولة و6 مرفوضة", async () => {
    expect((await put([{ targetId: 7, criterionId: 2, score: 5 }])).status).toBe(200);
    expect((await put([{ targetId: 7, criterionId: 2, score: 6 }])).status).toBe(400);
  });

  it("تكرار الخلية داخل الطلب: آخر قيمة تغلب (خلية واحدة للقاعدة)", async () => {
    await put([
      { targetId: 7, criterionId: 1, score: 3 },
      { targetId: 7, criterionId: 1, score: 8 },
    ]);
    expect(db.upsertEvaluations).toHaveBeenCalledWith(1, WEEK, "family", [
      { targetId: 7, criterionId: 1, score: 8, note: "" },
    ]);
  });

  it("الأسبوع يجب أن يكون سبتاً صالحاً، والنوع معروفاً، والخلايا غير فارغة", async () => {
    const entry = [{ targetId: 7, criterionId: 1, score: 1 }];
    expect((await put(entry, "2026-10-11")).status).toBe(400); // أحد
    expect((await put(entry, "2026-13-01")).status).toBe(400);
    expect((await put(entry, WEEK, "teacher")).status).toBe(400);
    expect((await put([])).status).toBe(400);
    expect(db.upsertEvaluations).not.toHaveBeenCalled();
  });

  it("GET: معاملات صالحة تعيد المعايير الفعّالة فقط والأهداف والدرجات", async () => {
    vi.mocked(db.listCriteria).mockResolvedValue([
      { id: 1, mosqueId: 1, name: "الحضور", maxScore: 10, sortOrder: 1, active: true, createdAt: "" },
      { id: 2, mosqueId: 1, name: "قديم", maxScore: 5, sortOrder: 2, active: false, createdAt: "" },
    ]);
    vi.mocked(db.listWeekEvaluations).mockResolvedValue([{ targetId: 7, criterionId: 1, score: 9, note: "" }]);
    const res = await EVAL_GET(new Request(`http://x?week=${WEEK}&kind=family`), ctx());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.criteria.map((c: { id: number }) => c.id)).toEqual([1]);
    expect(db.listWeekEvaluations).toHaveBeenCalledWith(1, WEEK, "family");

    expect((await EVAL_GET(new Request("http://x?week=bad&kind=family"), ctx())).status).toBe(400);
  });

  it("معيار: درجة عظمى خارج 1..100 = 400، واسم مكرر = 409", async () => {
    for (const maxScore of [0, 101, 2.5, "x"]) {
      expect((await CRITERIA_POST(json({ name: "س", maxScore }), ctx())).status).toBe(400);
    }
    vi.mocked(db.createCriterion).mockResolvedValue(null);
    expect((await CRITERIA_POST(json({ name: "الحضور" }), ctx())).status).toBe(409);
    expect(db.createCriterion).toHaveBeenCalledWith(1, { name: "الحضور", maxScore: 10 });
  });

  it("تعديل معيار: تعارض الاسم = 409، وغير موجود = 404، وتفعيل غير منطقي = 400", async () => {
    const c = ctx({ criterionId: "1" });
    vi.mocked(db.updateCriterion).mockResolvedValue("conflict");
    expect((await CRITERION_PATCH(json({ name: "س" }, "PATCH"), c)).status).toBe(409);
    vi.mocked(db.updateCriterion).mockResolvedValue(null);
    expect((await CRITERION_PATCH(json({ active: false }, "PATCH"), c)).status).toBe(404);
    expect((await CRITERION_PATCH(json({ active: "no" }, "PATCH"), c)).status).toBe(400);
  });
});

describe("معاملات المسار غير الصالحة = 404 قبل أي وصول للقاعدة", () => {
  const bad = ["abc", "0", "-1", "1.5", "1e3", "", "99999999999999999999"];
  const cases: [string, (v: string) => Promise<Response>][] = [
    ["mosque id", (v) => FAMILIES_GET(new Request("http://x"), { params: Promise.resolve({ id: v }) } as never)],
    ["familyId", (v) => FAMILY_MEMBERS_POST(json({ memberKind: "member", memberId: 1 }), ctx({ familyId: v }))],
    ["committeeId", (v) => TASKS_POST(json({ title: "ت" }), ctx({ committeeId: v }))],
    ["taskId", (v) => TASK_PATCH(json({ status: "done" }, "PATCH"), ctx({ committeeId: "1", taskId: v }))],
    ["criterionId", (v) => CRITERION_PATCH(json({ name: "س" }, "PATCH"), ctx({ criterionId: v }))],
  ];
  for (const [name, call] of cases) {
    it.each(bad)(`${name}: "%s" = 404`, async (v) => {
      expect((await call(v)).status).toBe(404);
      expect(db.getFamily).not.toHaveBeenCalled();
      expect(db.setCommitteeTaskStatus).not.toHaveBeenCalled();
      expect(db.updateCriterion).not.toHaveBeenCalled();
      expect(db.listFamilies).not.toHaveBeenCalled();
    });
  }
});
