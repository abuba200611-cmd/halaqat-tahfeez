import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  سجل التدقيق (M3): كل تبديل ميزة، إيقاف/تفعيل معلّم من اللوحة، وبدء
  «عرض كـ» يكتب صفحة في dev_audit_log عبر logDevAction.
*/

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  currentImpersonation: vi.fn(),
  logDevAction: vi.fn(),
  // ميزات الجامع
  canAccessMosque: vi.fn(),
  getMosque: vi.fn(),
  getMosqueFeatures: vi.fn(),
  setMosqueFeature: vi.fn(),
  // إيقاف معلّم
  setTeacherActiveAny: vi.fn(),
  // عرض كـ
  startImpersonation: vi.fn(),
}));

vi.mock("@/lib/mosque/admin-auth", () => ({
  isAdmin: mocks.isAdmin,
  unauthorized: () => Response.json({ error: "غير مصرّح" }, { status: 401 }),
}));
vi.mock("@/lib/dev-impersonation", () => ({
  currentImpersonation: mocks.currentImpersonation,
  impersonationBlocked: () => Response.json({ error: "أثناء العرض كـ" }, { status: 403 }),
  startImpersonation: mocks.startImpersonation,
}));
vi.mock("@/lib/dev-audit", () => ({ logDevAction: mocks.logDevAction }));
vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: mocks.canAccessMosque }));
vi.mock("@/lib/mosque/db", () => ({
  getMosque: mocks.getMosque,
  getMosqueFeatures: mocks.getMosqueFeatures,
  setMosqueFeature: mocks.setMosqueFeature,
}));
vi.mock("@/lib/dev-db", () => ({ setTeacherActiveAny: mocks.setTeacherActiveAny }));

const { PATCH: featuresPATCH } = await import("@/app/api/mosques/[id]/features/route");
const { POST: teacherActivePOST } = await import("@/app/api/dev/users/teacher-active/route");
const { POST: impersonatePOST } = await import("@/app/api/dev/impersonate/route");

const ctx = { params: Promise.resolve({ id: "5" }) };

function jsonRequest(url: string, body: unknown, method = "POST"): Request {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isAdmin.mockResolvedValue(true);
  mocks.currentImpersonation.mockResolvedValue(null);
  mocks.canAccessMosque.mockResolvedValue(true);
  mocks.getMosque.mockResolvedValue({ id: 5, name: "جامع النور", city: "", createdAt: "" });
  mocks.getMosqueFeatures.mockResolvedValue([]);
  mocks.setMosqueFeature.mockResolvedValue(undefined);
  mocks.setTeacherActiveAny.mockResolvedValue(true);
  mocks.startImpersonation.mockResolvedValue("معلّم تجريبي");
});

describe("تبديل ميزة جامع يسجَّل", () => {
  it("PATCH /api/mosques/[id]/features يكتب feature_toggle بالمفتاح والحالة", async () => {
    const res = await featuresPATCH(
      jsonRequest("http://localhost/api/mosques/5/features", { key: "badges", enabled: true }, "PATCH"),
      ctx,
    );
    expect(res.status).toBe(200);
    expect(mocks.logDevAction).toHaveBeenCalledWith("feature_toggle", "mosque", 5, { key: "badges", enabled: true });
  });
});

describe("إيقاف معلّم من اللوحة يسجَّل", () => {
  it("POST /api/dev/users/teacher-active يكتب teacher_deactivate", async () => {
    const res = await teacherActivePOST(jsonRequest("http://localhost/api/dev/users/teacher-active", { teacherId: 9, active: false }));
    expect(res.status).toBe(200);
    expect(mocks.setTeacherActiveAny).toHaveBeenCalledWith(9, false);
    expect(mocks.logDevAction).toHaveBeenCalledWith("teacher_deactivate", "teacher", 9, { via: "dev-console" });
  });

  it("والتفعيل يكتب teacher_reactivate", async () => {
    await teacherActivePOST(jsonRequest("http://localhost/api/dev/users/teacher-active", { teacherId: 9, active: true }));
    expect(mocks.logDevAction).toHaveBeenCalledWith("teacher_reactivate", "teacher", 9, { via: "dev-console" });
  });
});

describe("بدء «عرض كـ» يسجَّل", () => {
  it("POST /api/dev/impersonate يكتب impersonate_start مع التسمية", async () => {
    const res = await impersonatePOST(
      jsonRequest("http://localhost/api/dev/impersonate", { kind: "teacher", id: 42 }),
    );
    expect(res.status).toBe(200);
    expect(mocks.startImpersonation).toHaveBeenCalledWith("teacher", 42, 0);
    expect(mocks.logDevAction).toHaveBeenCalledWith("impersonate_start", "teacher", 42, { label: "معلّم تجريبي" });
  });

  it("هدف مفقود: 404 بلا تسجيل", async () => {
    mocks.startImpersonation.mockResolvedValue(null);
    const res = await impersonatePOST(
      jsonRequest("http://localhost/api/dev/impersonate", { kind: "teacher", id: 99 }),
    );
    expect(res.status).toBe(404);
    expect(mocks.logDevAction).not.toHaveBeenCalled();
  });

  it("انتحال نشط سابق: 409 بلا بدء ثانٍ", async () => {
    mocks.currentImpersonation.mockResolvedValue({ kind: "teacher", targetId: 1 });
    const res = await impersonatePOST(
      jsonRequest("http://localhost/api/dev/impersonate", { kind: "teacher", id: 42 }),
    );
    expect(res.status).toBe(409);
    expect(mocks.startImpersonation).not.toHaveBeenCalled();
  });
});
