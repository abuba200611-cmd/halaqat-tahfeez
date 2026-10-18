import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Halaqah, MosqueRegistration } from "@/lib/mosque/db";

/*
  buildMosqueGraph: عُقَد/حوافّ من بيانات الجامع الفعلية (db ونظام المعلّم
  مُحاكيان)، تسامح مع فشل قائمة حلقة، وعزل بيانات الجوامع، ونص السياق.
*/

vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(),
  listActivities: vi.fn(),
  getMosqueFeatures: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listBadgeAwardLinks: vi.fn(),
  listBadges: vi.fn(),
  listBrainNotes: vi.fn(),
  listCommitteeMemberLinks: vi.fn(),
  listCommittees: vi.fn(),
  listFamilies: vi.fn(),
  listFamilyMemberLinks: vi.fn(),
  listHalaqahs: vi.fn(),
  listMosqueRegistrations: vi.fn(),
}));
vi.mock("@/lib/mosque/halaqat", () => ({ getHalaqahRoster: vi.fn(), getMetricsForHalaqah: vi.fn() }));

import { buildGraphContext, buildMosqueGraph } from "@/lib/mosque/brain-graph";
import {
  getMosque,
  listActivities,
  getMosqueFeatures,
  isFeatureEnabled,
  listBadgeAwardLinks,
  listBadges,
  listBrainNotes,
  listCommitteeMemberLinks,
  listCommittees,
  listFamilies,
  listFamilyMemberLinks,
  listHalaqahs,
  listMosqueRegistrations,
} from "@/lib/mosque/db";
import { getHalaqahRoster, getMetricsForHalaqah } from "@/lib/mosque/halaqat";

const halaqah = (id: number, name: string): Halaqah => ({
  id,
  mosqueId: 1,
  halaqahName: name,
  teacherName: `معلم ${name}`,
  createdAt: "",
});
const pending = (id: number, status: MosqueRegistration["status"], halaqahId: number | null): MosqueRegistration => ({
  id,
  mosqueId: 1,
  name: `طالب ${id}`,
  phone: "",
  status,
  halaqahId,
  studentId: null,
  createdAt: "",
  assignedAt: null,
});
const student = (name: string) => ({ id: `sid-${name}`, name, group: "", pages: 0, avgMastery: 0, active: true });
const note = (slug: string, body: string) => ({
  id: 1,
  mosqueId: 1,
  slug,
  title: slug,
  body,
  tags: [],
  createdAt: "",
  updatedAt: "",
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getMosque).mockResolvedValue({ id: 1, name: "جامع النور", city: "مكة", createdAt: "" });
  vi.mocked(listHalaqahs).mockResolvedValue([halaqah(10, "الفجر"), halaqah(11, "العصر")]);
  vi.mocked(listMosqueRegistrations).mockResolvedValue([]);
  vi.mocked(listBrainNotes).mockResolvedValue([]);
  vi.mocked(isFeatureEnabled).mockResolvedValue(false);
  vi.mocked(listFamilies).mockResolvedValue([]);
  vi.mocked(listFamilyMemberLinks).mockResolvedValue([]);
  vi.mocked(listCommittees).mockResolvedValue([]);
  vi.mocked(listActivities).mockResolvedValue([]);
  vi.mocked(listCommitteeMemberLinks).mockResolvedValue([]);
  vi.mocked(listBadges).mockResolvedValue([]);
  vi.mocked(listBadgeAwardLinks).mockResolvedValue([]);
  vi.mocked(getMosqueFeatures).mockResolvedValue([
    { key: "halaqat", nameAr: "الحلقات", descriptionAr: "", defaultEnabled: true, status: "ready", enabled: true },
    { key: "stats", nameAr: "الإحصائيات", descriptionAr: "", defaultEnabled: true, status: "ready", enabled: false },
    { key: "families", nameAr: "الأسر", descriptionAr: "", defaultEnabled: false, status: "soon", enabled: true },
  ]);
  vi.mocked(getHalaqahRoster).mockImplementation(async (h) => ({
    teacherName: `أ. ${h.id === 10 ? "A" : "B"}`,
    halaqahName: h.halaqahName,
    students: h.id === 10 ? [student("أحمد"), student("بلال")] : [student("سعد")],
  }));
  vi.mocked(getMetricsForHalaqah).mockResolvedValue(null);
});

describe("buildMosqueGraph", () => {
  it("جامع ← حلقات ← معلم وطلاب، والمزايا المفعّلة الجاهزة فقط", async () => {
    const graph = await buildMosqueGraph(1);
    const count = (type: string) => graph.nodes.filter((n) => n.type === type).length;

    expect(count("mosque")).toBe(1);
    expect(count("halaqah")).toBe(2);
    expect(count("teacher")).toBe(2);
    expect(count("student")).toBe(3);
    expect(graph.nodes.filter((n) => n.type === "feature").map((n) => n.label)).toEqual(["الحلقات"]);
    // 2 حلقة + 2 معلم + 3 طلاب + ميزة واحدة
    expect(graph.edges).toHaveLength(8);
    expect(graph.nodes.find((n) => n.id === "teacher:10")?.label).toBe("أ. A");
  });

  it("فشل جلب قائمة حلقة لا يرمي: تبقى العقدة وعليها meta.error", async () => {
    vi.mocked(getHalaqahRoster).mockImplementation(async (h) => {
      throw new Error(`down ${h.id}`);
    });
    const graph = await buildMosqueGraph(1);
    expect(graph.nodes.find((n) => n.id === "halaqah:10")?.meta.error).toBe(true);
    expect(graph.nodes.find((n) => n.id === "halaqah:11")?.meta.error).toBe(true);
    expect(graph.nodes.some((n) => n.type === "student")).toBe(false);
  });

  it("عقدة الطالب بمعرّفه الحقيقي، ومقاييسه تُربط بالمعرّف لا بالاسم", async () => {
    vi.mocked(getMetricsForHalaqah).mockImplementation(async (h) =>
      h.id === 10
        ? ({
            halaqah: { name: "الفجر", teacherName: "أ", activeStudents: 2 },
            totals: { attendanceRate: 90 },
            students: [
              // اسم مختلف تماماً عن القائمة، لكن المعرّف يطابق "أحمد"
              { id: "sid-أحمد", name: "اسم مختلف", engagementScore: 77, attendanceRate: 100, streak: 3 },
            ],
          } as never)
        : null,
    );
    const graph = await buildMosqueGraph(1);
    const ahmad = graph.nodes.find((n) => n.id === "student:10:sid-أحمد");
    expect(ahmad?.label).toBe("أحمد");
    expect(ahmad?.meta).toMatchObject({ engagementScore: 77, attendanceRate: 100, streak: 3 });
    // بلال بلا مقاييس بمعرّفه: لا تُنسب له مقاييس أحمد حتى لو تشابهت الأسماء
    expect(graph.nodes.find((n) => n.id === "student:10:sid-بلال")?.meta.engagementScore).toBeUndefined();
  });

  it("طلبات التسجيل: المعلّقة على المحور، والموزَّعة بحلقتها، وحلقة جامع آخر تُهمَل", async () => {
    vi.mocked(listMosqueRegistrations).mockResolvedValue([
      pending(1, "pending", null),
      pending(2, "assigned", 10),
      pending(3, "assigned", 999),
    ]);
    const graph = await buildMosqueGraph(1);
    const edge = (target: string) => graph.edges.find((e) => e.target === target);

    expect(graph.nodes.find((n) => n.id === "pending-hub")?.label).toBe("طلبات التسجيل");
    expect(edge("pending:1")?.source).toBe("pending-hub");
    expect(edge("pending:2")?.source).toBe("halaqah:10");
    // الحلقة 999 ليست من هذا الجامع: لا حافة معلّقة بعقدة غير موجودة
    expect(edge("pending:3")).toBeUndefined();
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(graph.edges.every((e) => ids.has(e.source) && ids.has(e.target))).toBe(true);
  });

  it("كل الاستعلامات تُقيَّد بمعرّف الجامع المطلوب", async () => {
    await buildMosqueGraph(1);
    for (const fn of [listHalaqahs, listMosqueRegistrations, listBrainNotes, getMosqueFeatures]) {
      expect(fn).toHaveBeenCalledWith(1);
    }
  });

  it("ملاحظات قديمة: تُربط بوصلات [[..]] الموجودة فقط", async () => {
    vi.mocked(listBrainNotes).mockResolvedValue([note("أ", "راجع [[ب]] و[[غائبة]]"), note("ب", "")]);
    const graph = await buildMosqueGraph(1);
    expect(graph.edges.filter((e) => e.kind === "link")).toEqual([
      { source: "note:أ", target: "note:ب", kind: "link" },
    ]);
  });
});

describe("مصادر الأسر واللجان", () => {
  const family = { id: 5, mosqueId: 1, name: "أسرة النور", leaderName: "خالد", notes: "", createdAt: "", memberCount: 2 };
  const committee = { id: 7, mosqueId: 1, name: "لجنة الأنشطة", description: "", createdAt: "", memberCount: 2 };

  it("الميزتان معطّلتان: لا عُقَد أسر ولا لجان ولا استعلامات لها", async () => {
    const graph = await buildMosqueGraph(1);
    expect(graph.nodes.some((n) => n.type === "family" || n.type === "committee" || n.type === "member")).toBe(false);
    expect(listFamilies).not.toHaveBeenCalled();
    expect(listCommittees).not.toHaveBeenCalled();
  });

  it("أسرة ← أفرادها: الطالب بعقدة التسجيل، والعضو الحر بعقدة مستقلة", async () => {
    vi.mocked(isFeatureEnabled).mockImplementation(async (_id, key) => key === "families");
    vi.mocked(listMosqueRegistrations).mockResolvedValue([pending(1, "pending", null)]);
    vi.mocked(listFamilies).mockResolvedValue([family]);
    vi.mocked(listFamilyMemberLinks).mockResolvedValue([
      { familyId: 5, memberKind: "student", memberId: 1, name: "طالب 1" },
      { familyId: 5, memberKind: "member", memberId: 9, name: "أبو خالد" },
    ]);
    const graph = await buildMosqueGraph(1);

    expect(graph.nodes.find((n) => n.id === "family:5")?.type).toBe("family");
    expect(graph.nodes.find((n) => n.id === "member:9")?.type).toBe("member");
    expect(graph.edges).toContainEqual({ source: "mosque:1", target: "family:5", kind: "family" });
    expect(graph.edges).toContainEqual({ source: "family:5", target: "pending:1", kind: "family-member" });
    expect(graph.edges).toContainEqual({ source: "family:5", target: "member:9", kind: "family-member" });
    expect(listFamilies).toHaveBeenCalledWith(1);
    expect(listFamilyMemberLinks).toHaveBeenCalledWith(1);
    expect(listCommittees).not.toHaveBeenCalled();
  });

  it("لجنة ← أعضاؤها، والعضو الحر المشترك مع أسرة عقدة واحدة", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
    vi.mocked(listFamilies).mockResolvedValue([family]);
    vi.mocked(listFamilyMemberLinks).mockResolvedValue([{ familyId: 5, memberKind: "member", memberId: 9, name: "أبو خالد" }]);
    vi.mocked(listCommittees).mockResolvedValue([committee]);
    vi.mocked(listCommitteeMemberLinks).mockResolvedValue([
      { committeeId: 7, memberKind: "member", memberId: 9, name: "أبو خالد", role: "رئيس" },
    ]);
    const graph = await buildMosqueGraph(1);

    expect(graph.nodes.filter((n) => n.id === "member:9")).toHaveLength(1);
    expect(graph.edges).toContainEqual({ source: "committee:7", target: "member:9", kind: "committee-member" });
    expect(buildGraphContext(graph)).toContain("اللجان: 1");
  });
});

describe("مصدر الأوسمة", () => {
  const badge = { id: 3, mosqueId: 1, name: "نجم الأسبوع", icon: "⭐", description: "", criteriaNote: "", createdAt: "", awardCount: 2 };

  it("الميزة معطّلة: لا عُقد أوسمة ولا استعلامات لها", async () => {
    const graph = await buildMosqueGraph(1);
    expect(graph.nodes.some((n) => n.type === "badge")).toBe(false);
    expect(listBadges).not.toHaveBeenCalled();
  });

  it("وسام ← أهدافه: الطالب بعقدة التسجيل والعضو الحر بعقدته والأسرة بعقدتها", async () => {
    vi.mocked(isFeatureEnabled).mockImplementation(async (_id, key) => key === "badges");
    vi.mocked(listBadges).mockResolvedValue([badge]);
    vi.mocked(listBadgeAwardLinks).mockResolvedValue([
      { badgeId: 3, badgeName: "نجم الأسبوع", icon: "⭐", targetKind: "student", targetId: 1, targetName: "طالب 1" },
      { badgeId: 3, badgeName: "نجم الأسبوع", icon: "⭐", targetKind: "member", targetId: 9, targetName: "أبو خالد" },
      { badgeId: 3, badgeName: "نجم الأسبوع", icon: "⭐", targetKind: "family", targetId: 5, targetName: "أسرة النور" },
    ]);
    // عُقد الأهداف يجب أن توجد من مصدر آخر وإلا حُذفت الحافة
    vi.mocked(listMosqueRegistrations).mockResolvedValue([pending(1, "pending", null)]);

    const graph = await buildMosqueGraph(1);
    const badgeNode = graph.nodes.find((n) => n.id === "badge:3");
    expect(badgeNode?.type).toBe("badge");
    expect(badgeNode?.label).toContain("نجم الأسبوع");
    // حافة الطالب موجودة (عقدته من مصدر التسجيل)، والعضو الحر والأسرة لا: عُقدهما غير موجودة
    expect(graph.edges).toContainEqual({ source: "badge:3", target: "pending:1", kind: "badge" });
    expect(graph.edges.some((e) => e.target === "member:9" || e.target === "family:5")).toBe(false);
    expect(buildGraphContext(graph)).toContain("الأوسمة: 1");
    expect(listBadges).toHaveBeenCalledWith(1);
    expect(listBadgeAwardLinks).toHaveBeenCalledWith(1);
  });
});

describe("buildGraphContext", () => {
  it("ملخص عربي بالأعداد وكل حلقة بمعلمها وعدد طلابها", async () => {
    vi.mocked(listMosqueRegistrations).mockResolvedValue([pending(1, "pending", null), pending(2, "assigned", 10)]);
    const text = buildGraphContext(await buildMosqueGraph(1));

    expect(text).toContain("الجامع: جامع النور");
    expect(text).toContain("عدد الحلقات: 2");
    expect(text).toContain("عدد الطلاب: 3");
    expect(text).toContain("طلبات التسجيل: 2 (بانتظار التوزيع: 1)");
    expect(text).toContain("المزايا المفعّلة: الحلقات");
    expect(text).toContain("- الفجر — المعلم: أ. A — 2 طالب");
    expect(text).toContain("- العصر — المعلم: أ. B — 1 طالب");
  });
});
