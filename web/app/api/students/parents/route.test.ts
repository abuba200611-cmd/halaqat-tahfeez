import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  unauthorized: vi.fn(() => Response.json({ error: "x" }, { status: 401 })),
  SESSION_COOKIE: "session",
  createSessionToken: vi.fn(),
}));
vi.mock("@/lib/auth", () => authMocks);

// حارس «عرض كـ» حقيقي فوق كوكيز مُحاكاة (imp=1 ⇔ كوكي dev_imp صالح)
const jar = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (jar[name] ? { name, value: jar[name]! } : undefined),
    set: (name: string, value: string) => {
      jar[name] = value;
    },
    delete: (name: string) => {
      delete jar[name];
    },
  })),
}));
vi.mock("@netlify/database", () => ({ getDatabase: () => ({ sql: vi.fn() }) }));

const parentDbMocks = vi.hoisted(() => ({
  listHalaqahStudentParents: vi.fn(),
  unlinkParentFromStudent: vi.fn(),
}));
vi.mock("@/lib/parent-db", () => parentDbMocks);

process.env.SESSION_SECRET = "test-secret-not-for-production";

const { GET, DELETE } = await import("./route");
const { createImpersonationToken, IMPERSONATION_COOKIE } = await import("@/lib/dev-impersonation");

const teacher = (role: "supervisor" | "assistant") => ({ id: 2, halaqahId: 4, role });
const del = (body: unknown) =>
  new Request("http://localhost/api/students/parents", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("/api/students/parents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(jar)) delete jar[key];
  });

  it("imp=1 («عرض كـ» فعّال): 403 بلا أي فكّ ربط", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacher("supervisor"));
    jar[IMPERSONATION_COOKIE] = (await createImpersonationToken("teacher", 2, 0)).token;
    const res = await DELETE(del({ studentId: "s1", parentId: 3 }));
    expect(res.status).toBe(403);
    expect(parentDbMocks.unlinkParentFromStudent).not.toHaveBeenCalled();
  });

  it("فكّ الربط: المشرف فقط — المساعد 403 بلا أي حذف", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacher("assistant"));
    const res = await DELETE(del({ studentId: "s1", parentId: 3 }));
    expect(res.status).toBe(403);
    expect(parentDbMocks.unlinkParentFromStudent).not.toHaveBeenCalled();
  });

  it("المشرف يفكّ الربط داخل حلقته هو (الحلقة من الجلسة لا من الجسم)", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacher("supervisor"));
    parentDbMocks.unlinkParentFromStudent.mockResolvedValue(true);
    const res = await DELETE(del({ studentId: "s1", parentId: 3, halaqahId: 99 }));
    expect(res.status).toBe(200);
    expect(parentDbMocks.unlinkParentFromStudent).toHaveBeenCalledWith(4, "s1", 3);
  });

  it("ربط غير موجود: 404", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacher("supervisor"));
    parentDbMocks.unlinkParentFromStudent.mockResolvedValue(false);
    expect((await DELETE(del({ studentId: "s1", parentId: 3 }))).status).toBe(404);
  });

  it("بلا جلسة معلّم: 401", async () => {
    authMocks.currentTeacher.mockResolvedValue(null);
    expect((await DELETE(del({ studentId: "s1", parentId: 3 }))).status).toBe(401);
  });

  it("GET يقنّع البريد ويعلن صلاحية فكّ الربط حسب الدور", async () => {
    authMocks.currentTeacher.mockResolvedValue(teacher("assistant"));
    parentDbMocks.listHalaqahStudentParents.mockResolvedValue({
      s1: [{ parentId: 3, name: "أب", email: "abcdef@gmail.com" }],
    });
    const body = await (await GET()).json();
    expect(body.canUnlink).toBe(false);
    expect(body.parents.s1[0].email).toBe("ab***@gmail.com");
    expect(parentDbMocks.listHalaqahStudentParents).toHaveBeenCalledWith(4);
  });
});
