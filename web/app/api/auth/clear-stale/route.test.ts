import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ names: new Set<string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (n: string) => (jar.names.has(n) ? { name: n, value: "x" } : undefined) }),
}));

const mocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  currentStudent: vi.fn(),
  clearSessionCookie: vi.fn(),
  clearStudentSessionCookie: vi.fn(),
  currentParent: vi.fn(),
  clearParentSessionCookie: vi.fn(),
  currentMosqueAdmin: vi.fn(),
  clearMosqueAdminSession: vi.fn(),
  currentAssociationAdmin: vi.fn(),
  clearAssociationAdminSession: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  currentTeacher: mocks.currentTeacher,
  currentStudent: mocks.currentStudent,
  clearSessionCookie: mocks.clearSessionCookie,
  clearStudentSessionCookie: mocks.clearStudentSessionCookie,
}));
vi.mock("@/lib/parent-auth", () => ({ currentParent: mocks.currentParent, clearParentSessionCookie: mocks.clearParentSessionCookie }));
vi.mock("@/lib/mosque-auth", () => ({ currentMosqueAdmin: mocks.currentMosqueAdmin, clearMosqueAdminSession: mocks.clearMosqueAdminSession }));
vi.mock("@/lib/association-auth", () => ({
  currentAssociationAdmin: mocks.currentAssociationAdmin,
  clearAssociationAdminSession: mocks.clearAssociationAdminSession,
}));

const { POST } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
  jar.names = new Set();
  for (const k of ["currentTeacher", "currentStudent", "currentParent", "currentMosqueAdmin", "currentAssociationAdmin"] as const) {
    mocks[k].mockResolvedValue(null);
  }
});

describe("POST /api/auth/clear-stale", () => {
  it("كوكي معلّم ميّت → يُمسح ويرجع home فارغاً (الواجهة تحوّل للترحيب)", async () => {
    jar.names.add("halaqa_session");
    const body = await (await POST()).json();
    expect(mocks.clearSessionCookie).toHaveBeenCalledTimes(1);
    expect(body).toEqual({ ok: true, cleared: ["teacher"], home: null });
  });

  it("بلا أي كوكي → لا شيء يُمسح ولا يُفحص", async () => {
    const body = await (await POST()).json();
    expect(body).toEqual({ ok: true, cleared: [], home: null });
    expect(mocks.currentTeacher).not.toHaveBeenCalled();
  });

  it("كوكي معلّم ميّت + مدير جامع صالح → يُمسح الميّت فقط وhome لصفحة الجامع", async () => {
    jar.names.add("halaqa_session").add("mosque_admin_session");
    mocks.currentMosqueAdmin.mockResolvedValue({ id: 1, mosqueId: 9, username: "u" });
    const body = await (await POST()).json();
    expect(mocks.clearSessionCookie).toHaveBeenCalled();
    expect(mocks.clearMosqueAdminSession).not.toHaveBeenCalled();
    expect(body).toEqual({ ok: true, cleared: ["teacher"], home: "/mosque/9" });
  });

  it("كل الأدوار الخمسة الميتة تُمسح كلها", async () => {
    for (const n of ["halaqa_session", "halaqa_student", "halaqa_parent", "mosque_admin_session", "association_admin_session"]) jar.names.add(n);
    const body = await (await POST()).json();
    expect(body.cleared).toEqual(["teacher", "student", "parent", "mosque_admin", "association"]);
    expect(mocks.clearAssociationAdminSession).toHaveBeenCalled();
  });
});
