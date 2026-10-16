import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  عزل مسارات الاختبارات: مدير جامع A لا يصل لجامع B (401)، والميزة المعطّلة
  404، والمعرّف غير الصالح 404، والمعلّم لا يرشّح إلا بطلاب حلقته وبأنواع
  جامعه. نفس أسلوب isolation.test: الجلسات حقيقية والكوكيهات والقاعدة محاكاة.
*/

const jar: Record<string, string> = {};
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar[name] ? { value: jar[name] } : undefined),
    set: () => undefined,
    delete: (name: string) => {
      delete jar[name];
    },
  }),
  headers: async () => ({ get: () => null }),
}));

vi.mock("@/lib/db", () => ({
  sessionSecret: async () => "exams-test-secret",
  findMosqueAdminById: async (id: number) =>
    id === 100 ? { id: 100, mosqueId: 1, username: "admin1" } : null,
  findTeacherById: async (id: number) =>
    id === 7
      ? { id: 7, halaqahId: 42, halaqahName: "حلقة", teacherName: "معلم", role: "supervisor", sessionVersion: 0, emailVerified: true, deactivatedAt: null }
      : null,
  teacherSessionVersion: async () => 0,
  studentSessionVersion: async () => 0,
  findStudentAccount: async () => null,
  checkAdminLoginRateLimit: async () => true,
  recordFailedAdminLoginAttempt: async () => undefined,
}));

const examsDb = vi.hoisted(() => ({
  getExamConfig: vi.fn(async () => ({} as never)),
  listExamTypes: vi.fn(async () => [] as never[]),
  listNominationsByHalaqah: vi.fn(async () => [] as never[]),
  listScoringSessionsForTeacher: vi.fn(async () => [] as never[]),
  listActiveExamTypes: vi.fn(async () => [] as never[]),
  updateExamConfig: vi.fn(async (_id: number, c: Record<string, unknown>) => ({ ...c })),
  seedDefaultExamTypes: vi.fn(async () => [] as never[]),
  listNominations: vi.fn(async () => [] as never[]),
  listSessions: vi.fn(async () => [] as never[]),
  listResults: vi.fn(async () => [] as never[]),
  listCertificates: vi.fn(async () => [] as never[]),
  listMosqueTeachers: vi.fn(async () => [] as never[]),
  listMosqueMemberOptions: vi.fn(async () => [] as never[]),
  getExamType: vi.fn(async () => null),
  findStudentInHalaqah: vi.fn(async () => null),
  createNomination: vi.fn(),
}));
vi.mock("@/lib/mosque/exams-db", () => examsDb);

const mosqueDb = vi.hoisted(() => ({
  getMosque: vi.fn(async (id: number) => ({ id, name: `جامع ${id}`, city: "", createdAt: "" })),
  isFeatureEnabled: vi.fn(async () => true),
  listHalaqahs: vi.fn(async () => []),
  getHalaqah: vi.fn(async (id: number): Promise<{ id: number; mosqueId: number | null; halaqahName: string; teacherName: string; createdAt: string } | null> =>
    id === 42 ? { id: 42, mosqueId: 1, halaqahName: "حلقة", teacherName: "م", createdAt: "" } : null,
  ),
  listMosqueMembers: vi.fn(async () => []),
}));
vi.mock("@/lib/mosque/db", () => mosqueDb);

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: () => Response.json({ error: "محاولات كثيرة" }, { status: 429 }),
}));

import { GET as examsHubGet, PATCH as examsHubPatch } from "@/app/api/mosques/[id]/exams/route";
import { POST as typePost } from "@/app/api/mosques/[id]/exams/types/route";
import { GET as teacherExamsGet, POST as nominatePost } from "@/app/api/exam-nominations/route";
import { createMosqueAdminSessionToken } from "@/lib/mosque-auth";
import { createSessionToken } from "@/lib/auth";
import { DEFAULT_EXAM_CONFIG } from "@/lib/mosque/exams";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const patch = (body: unknown) =>
  new Request("http://x", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  for (const key of Object.keys(jar)) delete jar[key];
  vi.clearAllMocks();
  mosqueDb.isFeatureEnabled.mockResolvedValue(true);
  examsDb.getExamConfig.mockResolvedValue({ ...DEFAULT_EXAM_CONFIG } as never);
  examsDb.listExamTypes.mockResolvedValue([
    { id: 11, name: "اختبار جزء", juzCount: 1, maxScore: 100, passMark: 60, errorRules: {}, active: true },
  ] as never[]);
});

describe("مسار الإدارة /api/mosques/[id]/exams", () => {
  it("بلا جلسة = 401", async () => {
    expect((await examsHubGet(new Request("http://x"), ctx("1"))).status).toBe(401);
  });

  it("مدير الجامع 1 لا يصل جامع 2 (عزل الجوامع)", async () => {
    jar.mosque_admin_session = await createMosqueAdminSessionToken(100);
    expect((await examsHubGet(new Request("http://x"), ctx("1"))).status).toBe(200);
    expect((await examsHubGet(new Request("http://x"), ctx("2"))).status).toBe(401);
  });

  it("ميزة معطّلة = 404 حتى لمدير الجامع نفسه", async () => {
    jar.mosque_admin_session = await createMosqueAdminSessionToken(100);
    mosqueDb.isFeatureEnabled.mockResolvedValue(false);
    const response = await examsHubGet(new Request("http://x"), ctx("1"));
    expect(response.status).toBe(404);
    expect(((await response.json()) as { error: string }).error).toContain("غير مفعّل");
  });

  it("معرّف غير رقمي = 404", async () => {
    jar.mosque_admin_session = await createMosqueAdminSessionToken(100);
    expect((await examsHubGet(new Request("http://x"), ctx("abc"))).status).toBe(404);
  });

  it("PATCH الإعدادات يعمل لمدير الجامع ويرفض غيره", async () => {
    jar.mosque_admin_session = await createMosqueAdminSessionToken(100);
    const ok = await examsHubPatch(patch({ config: { maxScore: 50 } }), ctx("1"));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { config: { maxScore: number } }).config.maxScore).toBe(50);
    expect((await examsHubPatch(patch({ config: {} }), ctx("2"))).status).toBe(401);
  });
});

describe("أنواع الاختبارات — العزل قبل أي كتابة", () => {
  it("مدير الجامع 1 لا ينشئ نوعاً بجامع 2", async () => {
    jar.mosque_admin_session = await createMosqueAdminSessionToken(100);
    expect((await typePost(post({ name: "نوع", juzCount: 1 }), ctx("2"))).status).toBe(401);
    expect(examsDb.listExamTypes).not.toHaveBeenCalled();
  });

  it("درجة نجاح فوق الدرجة العظمى تُرفض", async () => {
    jar.mosque_admin_session = await createMosqueAdminSessionToken(100);
    const response = await typePost(post({ name: "نوع", juzCount: 1, maxScore: 50, passMark: 60 }), ctx("1"));
    expect(response.status).toBe(400);
  });
});

describe("ترشيح المعلّم — حلقته وجامعها حصراً", () => {
  beforeEach(async () => {
    jar.halaqa_session = await createSessionToken(7, 0); // المعلّم 7 بحلقة 42 (جامع 1)
  });

  it("GET يعرض أنواع جامعه وترشيحات حلقته", async () => {
    const response = await teacherExamsGet();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { types: unknown[]; nominations: unknown[]; sessions: unknown[] };
    expect(Array.isArray(body.types)).toBe(true);
    expect(examsDb.listNominationsByHalaqah).toHaveBeenCalled();
  });

  it("حلقة بلا جامع أو ميزة معطّلة = 404", async () => {
    mosqueDb.getHalaqah.mockResolvedValue({ id: 42, mosqueId: null, halaqahName: "ح", teacherName: "م", createdAt: "" });
    expect((await teacherExamsGet()).status).toBe(404);
    mosqueDb.getHalaqah.mockResolvedValue({ id: 42, mosqueId: 1, halaqahName: "ح", teacherName: "م", createdAt: "" });
    mosqueDb.isFeatureEnabled.mockResolvedValue(false);
    expect((await teacherExamsGet()).status).toBe(404);
    mosqueDb.isFeatureEnabled.mockResolvedValue(true);
  });

  it("ترشيح صحيح يُنشأ، ونوع من جامع آخر أو طالب من حلقة أخرى يُرفض", async () => {
    examsDb.getExamType.mockResolvedValue({ id: 11, mosqueId: 1, juzCount: 1, maxScore: 100, passMark: 60, errorRules: {}, active: true } as never);
    examsDb.findStudentInHalaqah.mockResolvedValue({ id: "s1", name: "طالب" } as never);
    examsDb.createNomination.mockResolvedValue({ id: 5, studentName: "طالب" } as never);

    const ok = await nominatePost(post({ typeId: 11, studentId: "s1", juzFrom: 30, juzTo: 30 }));
    expect(ok.status).toBe(201);

    examsDb.getExamType.mockResolvedValue(null); // نوع ليس من جامع الحلقة
    expect((await nominatePost(post({ typeId: 99, studentId: "s1", juzFrom: 30, juzTo: 30 }))).status).toBe(404);

    examsDb.getExamType.mockResolvedValue({ id: 11, mosqueId: 1, juzCount: 1, maxScore: 100, passMark: 60, errorRules: {}, active: true } as never);
    examsDb.findStudentInHalaqah.mockResolvedValue(null); // طالب ليس من حلقة المعلّم
    expect((await nominatePost(post({ typeId: 11, studentId: "other", juzFrom: 30, juzTo: 30 }))).status).toBe(404);
  });

  it("نطاق أجزاء لا يطابق طول النوع يُرفض", async () => {
    examsDb.getExamType.mockResolvedValue({ id: 11, mosqueId: 1, juzCount: 5, maxScore: 100, passMark: 60, errorRules: {}, active: true } as never);
    examsDb.findStudentInHalaqah.mockResolvedValue({ id: "s1", name: "طالب" } as never);
    const response = await nominatePost(post({ typeId: 11, studentId: "s1", juzFrom: 26, juzTo: 27 }));
    expect(response.status).toBe(400);
  });

  it("بلا جلسة معلّم = 401", async () => {
    delete jar.halaqa_session;
    expect((await teacherExamsGet()).status).toBe(401);
    expect((await nominatePost(post({ typeId: 11 }))).status).toBe(401);
  });
});
