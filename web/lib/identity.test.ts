import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  M5 — اختبار محلّل الهوية lib/identity.ts: من كل نوع جلسة قائمة إلى
  {المستخدم، العضوية الحالية، العضويات}. كل قرّاء الجلسات وقاعدة البيانات
  مُحاكَون — الاختبار للترتيب والربط فقط.
*/

vi.mock("./db", () => ({
  db: vi.fn(() => ({ sql: sqlMock })),
}));
vi.mock("./auth", () => ({
  currentTeacher: vi.fn(),
  currentStudent: vi.fn(),
}));
vi.mock("./parent-auth", () => ({ currentParent: vi.fn() }));
vi.mock("./mosque-auth", () => ({ currentMosqueAdmin: vi.fn() }));
vi.mock("./mosque/admin-auth", () => ({ isAdmin: vi.fn() }));

import { currentMosqueAdmin } from "./mosque-auth";
import { isAdmin } from "./mosque/admin-auth";
import { currentParent } from "./parent-auth";
import { currentStudent, currentTeacher } from "./auth";

const sqlMock = vi.fn();

const { resolveIdentity, membershipShell } = await import("./identity");

function membershipRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    user_id: 42,
    role: "supervisor",
    mosque_id: null,
    halaqah_id: 3,
    student_id: null,
    legacy_kind: "teacher",
    legacy_id: "7",
    active: true,
    halaqah_name: "حلقة الفجر",
    mosque_name: null,
    ...overrides,
  };
}

function userRow(overrides: Record<string, unknown> = {}) {
  return { id: 42, display_name: "أحمد", email: "a@x.com", username: null, ...overrides };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(currentTeacher).mockResolvedValue(null);
  vi.mocked(currentStudent).mockResolvedValue(null);
  vi.mocked(currentParent).mockResolvedValue(null);
  vi.mocked(currentMosqueAdmin).mockResolvedValue(null);
  vi.mocked(isAdmin).mockResolvedValue(false);
});

describe("resolveIdentity — الترتيب الثابت للأنواع", () => {
  it("جلسة معلّم: عضوية legacy teacher بدوره ثم المستخدم وكل عضوياته", async () => {
    vi.mocked(currentTeacher).mockResolvedValue({
      id: 7,
      username: "a@x.com",
      teacherName: "أحمد",
      halaqahId: 3,
      halaqahName: "حلقة الفجر",
      role: "supervisor",
      emailVerified: true,
      sessionVersion: 0,
      deactivatedAt: null,
    });
    sqlMock
      .mockResolvedValueOnce([membershipRow()]) // findMembershipByLegacy
      .mockResolvedValueOnce([userRow()]) // getUserById
      .mockResolvedValueOnce([membershipRow(), membershipRow({ id: 2, role: "parent", legacy_kind: "parent", legacy_id: "9" })]); // listMembershipsForUser

    const identity = await resolveIdentity();
    expect(identity.kind).toBe("teacher");
    expect(identity.user?.email).toBe("a@x.com");
    expect(identity.current?.legacyId).toBe("7");
    expect(identity.memberships).toHaveLength(2);
  });

  it("جلسة طالب: المفتاح المركّب halaqahId:studentId", async () => {
    vi.mocked(currentStudent).mockResolvedValue({
      teacherId: 3,
      id: "abc",
      name: "خالد",
      halaqahName: "حلقة",
    });
    sqlMock
      .mockResolvedValueOnce([membershipRow({ role: "student", legacy_kind: "student", legacy_id: "3:abc", student_id: "abc" })])
      .mockResolvedValueOnce([userRow({ username: "khalid01" })])
      .mockResolvedValueOnce([membershipRow({ role: "student", legacy_kind: "student", legacy_id: "3:abc" })]);

    const identity = await resolveIdentity();
    expect(identity.kind).toBe("student");
    expect(identity.current?.legacyId).toBe("3:abc");
    // استعلام العضوية استُدعي بالمفتاح المركّب الصحيح (وسائط القالب الموسوم)
    const callArgs = sqlMock.mock.calls[0] as unknown[];
    expect(callArgs).toContain("3:abc");
  });

  it("جلسة ولي أمر ومدير جامع بعد الطالب بالترتيب", async () => {
    vi.mocked(currentParent).mockResolvedValue({ id: 9, email: "p@x.com", name: "ولي", sessionVersion: 0 });
    sqlMock
      .mockResolvedValueOnce([membershipRow({ role: "parent", legacy_kind: "parent", legacy_id: "9" })])
      .mockResolvedValueOnce([userRow()])
      .mockResolvedValueOnce([]);
    expect((await resolveIdentity()).kind).toBe("parent");

    vi.mocked(currentParent).mockResolvedValue(null);
    vi.mocked(currentMosqueAdmin).mockResolvedValue({ id: 4, mosqueId: 11, username: "admin" });
    sqlMock
      .mockResolvedValueOnce([membershipRow({ role: "mosque_admin", legacy_kind: "mosque_admin", legacy_id: "4", mosque_id: 11, mosque_name: "جامع النور" })])
      .mockResolvedValueOnce([userRow({ email: null, username: "admin" })])
      .mockResolvedValueOnce([]);
    const adminIdentity = await resolveIdentity();
    expect(adminIdentity.kind).toBe("mosque_admin");
    expect(adminIdentity.current?.mosqueName).toBe("جامع النور");
  });

  it("جلسة أدمن = developer بلا مستخدم (ADMIN_SECRET ليس حساباً)", async () => {
    vi.mocked(isAdmin).mockResolvedValue(true);
    const identity = await resolveIdentity();
    expect(identity.kind).toBe("developer");
    expect(identity.user).toBeNull();
    expect(identity.memberships).toEqual([]);
    expect(sqlMock).not.toHaveBeenCalled();
  });

  it("بلا أي جلسة: kind=null", async () => {
    const identity = await resolveIdentity();
    expect(identity.kind).toBeNull();
  });

  it("جلسة معلّم بلا صف عضوية (ترحيل لم يُطبَّق): النوع يبقى والمستخدم null", async () => {
    vi.mocked(currentTeacher).mockResolvedValue({
      id: 7,
      username: "a@x.com",
      teacherName: "",
      halaqahId: 3,
      halaqahName: "",
      role: "assistant",
      emailVerified: false,
      sessionVersion: 0,
      deactivatedAt: null,
    });
    sqlMock.mockResolvedValueOnce([]); // لا عضوية
    const identity = await resolveIdentity();
    expect(identity.kind).toBe("teacher");
    expect(identity.user).toBeNull();
    expect(identity.current).toBeNull();
  });
});

describe("membershipShell — تسمية الأدوار ووجهاتها", () => {
  it("كل دور يقود قشرته الصحيحة", () => {
    expect(membershipShell({ ...baseMembership(), role: "supervisor", halaqahName: "حلقة الفجر" }).home).toBe("/");
    expect(membershipShell({ ...baseMembership(), role: "assistant" }).kind).toBe("teacher");
    expect(membershipShell({ ...baseMembership(), role: "parent" }).home).toBe("/parent");
    expect(membershipShell({ ...baseMembership(), role: "student" }).home).toBe("/student");
    const mosque = membershipShell({ ...baseMembership(), role: "mosque_admin", mosqueId: 11 });
    expect(mosque.home).toBe("/mosque/11");
    expect(membershipShell({ ...baseMembership(), role: "developer" }).kind).toBe("developer");
  });
});

function baseMembership() {
  return {
    id: 1,
    userId: 42,
    role: "supervisor" as const,
    mosqueId: null,
    halaqahId: null,
    studentId: null,
    legacyKind: "teacher" as const,
    legacyId: "7",
    active: true,
    halaqahName: null,
    mosqueName: null,
  };
}
