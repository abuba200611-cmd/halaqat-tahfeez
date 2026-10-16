import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  عزل الأدوار والجوامع (حدّ الأمان الأهم بالدمج): الجلسات الثلاث —
  معلّم (halaqa_session)، مدير جامع (mosque_admin_session)، مشرف عام
  (admin_session القائم بـ ADMIN_SECRET) — كل منها بكوكيها وتوقيعها، لا
  تنفع واحدة مكان أخرى. الاختبار يستخدم الكود الحقيقي لـ access/admin-auth/
  mosque-auth/auth وتوكنات حقيقية؛ المحاكى فقط الكوكيز وطبقة القاعدة.
*/

const jar: Record<string, string> = {};
// مستضيج الطلب الحالي — يتحكم به isAdmin (dev split): localhost بم بيئة
// الاختبار = مستضيج لوحة، mos.vercel.app = مستضيج عام
let requestHostValue = "localhost:3000";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar[name] ? { value: jar[name] } : undefined),
    set: () => undefined,
    delete: (name: string) => {
      delete jar[name];
    },
  }),
  headers: async () => ({ get: (name: string) => (name === "host" ? requestHostValue : null) }),
}));

vi.mock("@/lib/db", () => ({
  sessionSecret: async () => "isolation-test-secret",
  findMosqueAdminById: async (id: number) =>
    id === 100 ? { id: 100, mosqueId: 1, username: "admin1" } : id === 200 ? { id: 200, mosqueId: 2, username: "admin2" } : null,
  findTeacherById: async (id: number) =>
    id === 7
      ? { id: 7, halaqahId: 42, halaqahName: "حلقة", teacherName: "معلم", role: "supervisor", sessionVersion: 0, deactivatedAt: null }
      : null,
  teacherSessionVersion: async () => 0,
  studentSessionVersion: async () => 0,
  findStudentAccount: async () => null,
  checkAdminLoginRateLimit: async () => true,
  recordFailedAdminLoginAttempt: async () => undefined,
}));

vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(async (id: number) => ({ id, name: `جامع ${id}`, city: "", createdAt: "" })),
  getMosqueFeatures: vi.fn(async () => []),
  listHalaqahs: vi.fn(async () => []),
  listMosqueRegistrations: vi.fn(async () => []),
  getHalaqah: vi.fn(async (id: number) =>
    id === 55 ? { id: 55, mosqueId: 2, halaqahName: "ح", teacherName: "م", createdAt: "" } : null,
  ),
  getMosqueRegistration: vi.fn(async () => ({
    id: 9,
    mosqueId: 2,
    name: "طالب",
    phone: "",
    status: "pending",
    halaqahId: null,
    studentId: null,
    createdAt: "",
    assignedAt: null,
  })),
  isFeatureEnabled: vi.fn(async () => true),
  claimRegistration: vi.fn(async () => true),
  setRegistrationStudent: vi.fn(async () => undefined),
  releaseRegistration: vi.fn(async () => undefined),
  getMosqueAdminForMosque: vi.fn(async () => null),
  upsertMosqueAdmin: vi.fn(async () => undefined),
  listMosques: vi.fn(async () => []),
  createMosque: vi.fn(async () => 1),
  findMosqueByTeacherJoinCode: vi.fn(async () => null),
  joinHalaqahToMosqueByCode: vi.fn(),
}));
vi.mock("@/lib/mosque/halaqat", () => ({
  getHalaqahRoster: vi.fn(async () => ({ teacherName: "", halaqahName: "", students: [] })),
  addStudentToHalaqah: vi.fn(async () => "sid"),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => true),
  rateLimited: () => Response.json({ error: "محاولات كثيرة" }, { status: 429 }),
}));

import { GET as mosqueGet } from "@/app/api/mosques/[id]/route";
import { GET as mosquesList, POST as mosquesCreate } from "@/app/api/mosques/route";
import { POST as adminAccountPost } from "@/app/api/mosques/[id]/admin-account/route";
import { GET as rosterGet } from "@/app/api/halaqahs/[id]/roster/route";
import { POST as assignPost } from "@/app/api/assign/route";
import { POST as teacherJoin } from "@/app/api/teacher/join-mosque/route";
import { GET as adminMe } from "@/app/api/admin/me/route";
import { GET as mosqueAdminMe } from "@/app/api/mosque-admin/me/route";
import { ADMIN_COOKIE } from "@/app/api/admin/login/route";
import { createAdminToken } from "@/lib/admin-session";
import { createSessionToken, currentTeacher } from "@/lib/auth";
import { createMosqueAdminSessionToken, currentMosqueAdmin } from "@/lib/mosque-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { isAdmin } from "@/lib/mosque/admin-auth";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (body: unknown) =>
  new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  for (const key of Object.keys(jar)) delete jar[key];
  process.env.ADMIN_SECRET = "dev-admin-secret";
  requestHostValue = "localhost:3000";
});

describe("مدير جامع A لا يصل لجامع B", () => {
  beforeEach(async () => {
    jar.mosque_admin_session = await createMosqueAdminSessionToken(100); // مدير الجامع 1
  });

  it("canAccessMosque: جامعه فقط", async () => {
    expect(await canAccessMosque(1)).toBe(true);
    expect(await canAccessMosque(2)).toBe(false);
  });

  it("GET /api/mosques/[id]: جامعه 200، وجامع آخر 401", async () => {
    expect((await mosqueGet(new Request("http://x"), ctx("1"))).status).toBe(200);
    expect((await mosqueGet(new Request("http://x"), ctx("2"))).status).toBe(401);
  });

  it("لا يخلق جوامع ولا يدير حسابات مديرين (المشرف العام فقط)", async () => {
    expect((await mosquesList()).status).toBe(401);
    expect((await mosquesCreate(post({ name: "ج", city: "" }))).status).toBe(401);
    expect((await adminAccountPost(post({ username: "u", password: "12345678" }), ctx("1"))).status).toBe(401);
  });

  it("لا يقرأ roster حلقة جامع آخر ولا يوزّع تسجيل جامع آخر", async () => {
    // الحلقة 55 والتسجيل 9 يتبعان الجامع 2
    expect((await rosterGet(new Request("http://x"), ctx("55"))).status).toBe(401);
    expect((await assignPost(post({ registrationId: 9, halaqahId: 55 }))).status).toBe(401);
  });

  it("جلسته لا تفتح مسارات المعلّم: currentTeacher=null والانضمام 401", async () => {
    expect(await currentTeacher()).toBeNull();
    expect((await teacherJoin(post({ code: "abc" }))).status).toBe(401);
  });

  it("توكنه لا يُقبل لو وُضع بكوكي المعلّم", async () => {
    const token = jar.mosque_admin_session;
    delete jar.mosque_admin_session;
    jar.halaqa_session = token;
    expect(await currentTeacher()).toBeNull();
  });
});

describe("جلسة المعلّم لا تفتح واجهات مدير الجامع", () => {
  beforeEach(async () => {
    jar.halaqa_session = await createSessionToken(7, 0);
  });

  it("المعلّم معرَّف كمعلّم فقط", async () => {
    expect((await currentTeacher())?.id).toBe(7);
    expect(await currentMosqueAdmin()).toBeNull();
    expect(await isAdmin()).toBe(false);
  });

  it("كل واجهات الجامع المحمية = 401 (مع جلسة معلّم صالحة)", async () => {
    expect(await canAccessMosque(1)).toBe(false);
    expect((await mosqueGet(new Request("http://x"), ctx("1"))).status).toBe(401);
    expect((await mosquesList()).status).toBe(401);
    expect((await rosterGet(new Request("http://x"), ctx("55"))).status).toBe(401);
    expect((await assignPost(post({ registrationId: 9, halaqahId: 55 }))).status).toBe(401);
    expect(await (await adminMe()).json()).toEqual({ admin: false });
    expect(await (await mosqueAdminMe()).json()).toEqual({ admin: null });
  });

  it("توكن المعلّم لا يُقبل لو وُضع بكوكي مدير الجامع أو الأدمن", async () => {
    jar.mosque_admin_session = jar.halaqa_session;
    jar[ADMIN_COOKIE] = jar.halaqa_session;
    expect(await currentMosqueAdmin()).toBeNull();
    expect(await isAdmin()).toBe(false);
  });
});

describe("المشرف العام = جلسة الأدمن القائمة نفسها (admin-session)", () => {
  it("توكن createAdminToken الحقيقي يفتح كل الجوامع", async () => {
    jar[ADMIN_COOKIE] = createAdminToken();
    expect(await isAdmin()).toBe(true);
    expect(await canAccessMosque(1)).toBe(true);
    expect(await canAccessMosque(2)).toBe(true);
    expect((await mosqueGet(new Request("http://x"), ctx("2"))).status).toBe(200);
    expect((await mosquesList()).status).toBe(200);
    expect(await (await adminMe()).json()).toEqual({ admin: true });
  });

  it("dev split: التوكن نفسه من مستضيج عام لا يُعامل كأدمن — الكوكي لا يعمل خارج مستضيج اللوحة", async () => {
    jar[ADMIN_COOKIE] = createAdminToken();
    requestHostValue = "mos.vercel.app";
    expect(await isAdmin()).toBe(false);
    expect(await canAccessMosque(1)).toBe(false);
    expect(await (await adminMe()).json()).toEqual({ admin: false });
  });

  it("السرّ الخام أو توكن مزوّر لا يعمل", async () => {
    jar[ADMIN_COOKIE] = "dev-admin-secret";
    expect(await isAdmin()).toBe(false);
    jar[ADMIN_COOKIE] = "admin.123.deadbeef";
    expect(await isAdmin()).toBe(false);
  });

  it("ADMIN_SECRET فارغ يعطّل الدخول بالكامل", async () => {
    const token = createAdminToken();
    process.env.ADMIN_SECRET = "";
    jar[ADMIN_COOKIE] = token;
    expect(await isAdmin()).toBe(false);
  });
});

describe("بلا أي جلسة", () => {
  it("كل شيء 401", async () => {
    expect((await mosqueGet(new Request("http://x"), ctx("1"))).status).toBe(401);
    expect((await rosterGet(new Request("http://x"), ctx("55"))).status).toBe(401);
    expect((await assignPost(post({ registrationId: 9, halaqahId: 55 }))).status).toBe(401);
    expect((await teacherJoin(post({ code: "abc" }))).status).toBe(401);
  });
});
