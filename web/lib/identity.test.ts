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
vi.mock("./association-auth", () => ({ currentAssociationAdmin: vi.fn() }));
vi.mock("./mosque/admin-auth", () => ({ isAdmin: vi.fn() }));

import { currentAssociationAdmin } from "./association-auth";
import { currentMosqueAdmin } from "./mosque-auth";
import { isAdmin } from "./mosque/admin-auth";
import { currentParent } from "./parent-auth";
import { currentStudent, currentTeacher } from "./auth";

const sqlMock = vi.fn();

const { resolveIdentity, membershipShell, ensureIdentity, loginHrefFor } = await import("./identity");

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
  vi.mocked(currentAssociationAdmin).mockResolvedValue(null);
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

  it("جلسة مدير جمعية: عضوية association_admin، وتأتي بعد مدير الجامع وقبل الأدمن", async () => {
    vi.mocked(currentAssociationAdmin).mockResolvedValue({ id: 6, associationId: 2, username: "assoc", sessionVersion: 0 });
    vi.mocked(isAdmin).mockResolvedValue(true);
    sqlMock
      .mockResolvedValueOnce([membershipRow({ role: "association_admin", legacy_kind: "association_admin", legacy_id: "6" })])
      .mockResolvedValueOnce([userRow({ email: null, username: "assoc" })])
      .mockResolvedValueOnce([]);
    const identity = await resolveIdentity();
    expect(identity.kind).toBe("association_admin");
    expect(identity.current?.legacyId).toBe("6");
    // الاستعلام بالمفتاح القديم الصحيح (legacy_kind=association_admin)
    expect(sqlMock.mock.calls[0] as unknown[]).toContain("association_admin");
  });

  it("مدير جامع وجمعية معاً: يغلب مدير الجامع (الأقدم بالترتيب) ولا يتغيّر سلوك دخوله", async () => {
    vi.mocked(currentMosqueAdmin).mockResolvedValue({ id: 4, mosqueId: 11, username: "admin" });
    vi.mocked(currentAssociationAdmin).mockResolvedValue({ id: 6, associationId: 2, username: "assoc", sessionVersion: 0 });
    sqlMock
      .mockResolvedValueOnce([membershipRow({ role: "mosque_admin", legacy_kind: "mosque_admin", legacy_id: "4" })])
      .mockResolvedValueOnce([userRow({ email: null, username: "admin" })])
      .mockResolvedValueOnce([]);
    expect((await resolveIdentity()).kind).toBe("mosque_admin");
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
    const association = membershipShell({ ...baseMembership(), role: "association_admin" });
    expect(association).toMatchObject({ kind: "association_admin", home: "/association" });
    expect(loginHrefFor("association_admin", { email: null, username: "assoc" })).toBe("/association-login?username=assoc");
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

// ————— ensureIdentity — النصف التشغيلي من backfill الترحيل —————
// عميل ترانزاكشن مزوَّر يحاكي قيود SQL ذاتها (users.email UNIQUE،
// memberships UNIQUE(legacy_kind, legacy_id, role, student_id)) فيُختبر
// سلوك الدالة الحقيقي: الخلق، تجاوز الموجود، ودمج البريد الواحد.

type FakeRow = Record<string, unknown>;

function fakeIdentityClient(existingUsers: FakeRow[] = [], existingMemberships: FakeRow[] = []) {
  const users = [...existingUsers];
  const memberships = [...existingMemberships];
  const calls: string[] = [];
  let nextId = 100;

  const client = {
    async query(text: string): Promise<{ rows: FakeRow[]; rowCount: number }> {
      calls.push(text);
      if (text.startsWith("SELECT id FROM memberships")) {
        return { rows: memberships, rowCount: memberships.length };
      }
      if (text.startsWith("SELECT id FROM users WHERE email")) {
        return { rows: users, rowCount: users.length };
      }
      if (text.startsWith("INSERT INTO users")) {
        // ON CONFLICT (email) DO NOTHING: بريد موجود = لا صف جديد
        if (users.length > 0) return { rows: [], rowCount: 0 };
        const row = { id: nextId++ };
        users.push(row);
        return { rows: [row], rowCount: 1 };
      }
      if (text.startsWith("INSERT INTO memberships")) {
        if (memberships.length > 0) return { rows: [], rowCount: 0 };
        memberships.push({ id: nextId++ });
        return { rows: [{ id: nextId - 1 }], rowCount: 1 };
      }
      throw new Error(`استعلام غير متوقع في الاختبار: ${text}`);
    },
  };

  return {
    client,
    calls,
    /** مستخدم أُنشئ فعلاً هذه المرة (معرّفه) — null لو أُعيد استخدام موجود */
    createdUserId: () => (users[0]?.id === 100 ? 100 : null),
    membershipCreated: () => memberships.length > existingMemberships.length,
  };
}

describe("ensureIdentity — إنشاء الهوية داخل ترانزاكشن المنشئ", () => {
  it("حساب جديد: مستخدم ثم عضوية", async () => {
    const fake = fakeIdentityClient();
    await ensureIdentity(fake.client, {
      user: { displayName: "أم محمد", email: "p@x.com", username: null },
      membership: {
        role: "parent",
        mosqueId: null,
        halaqahId: null,
        studentId: null,
        legacyKind: "parent",
        legacyId: "9",
        active: true,
      },
    });
    expect(fake.createdUserId()).toBe(100);
    expect(fake.membershipCreated()).toBe(true);
  });

  it("عضوية موجودة مسبقاً = لا شيء (متكرر التشغيل مثل الترحيل)", async () => {
    const fake = fakeIdentityClient([], [{ id: 7 }]);
    await ensureIdentity(fake.client, {
      user: { displayName: "أم محمد", email: "p@x.com", username: null },
      membership: {
        role: "parent",
        mosqueId: null,
        halaqahId: null,
        studentId: null,
        legacyKind: "parent",
        legacyId: "9",
        active: true,
      },
    });
    expect(fake.calls).toHaveLength(1); // فحص الوجود وحده، لا إنشاء بعده
    expect(fake.membershipCreated()).toBe(false);
  });

  it("بريد موجود (معلّم+ولي أمر) = إعادة استخدام المستخدم بعضوية ثانية", async () => {
    const fake = fakeIdentityClient([{ id: 42 }]); // مستخدم المعلّم بالبريد نفسه
    await ensureIdentity(fake.client, {
      user: { displayName: "أم محمد", email: "a@x.com", username: null },
      membership: {
        role: "parent",
        mosqueId: null,
        halaqahId: null,
        studentId: null,
        legacyKind: "parent",
        legacyId: "9",
        active: true,
      },
    });
    expect(fake.createdUserId()).toBeNull(); // لم يُنشأ مستخدم جديد
    expect(fake.membershipCreated()).toBe(true); // والعضوية الثانية أُضيفت
  });

  it("سباق INSERT المتزامن بنفس البريد: الفائز يُتبنّى بلا رمي", async () => {
    const fake = fakeIdentityClient();
    // INSERT الأول «يفشل» (DO NOTHING) ثم SELECT يجد صف الفائز
    let insertUsersCalled = false;
    const original = fake.client.query.bind(fake.client);
    fake.client.query = async (text: string) => {
      if (text.startsWith("INSERT INTO users") && !insertUsersCalled) {
        insertUsersCalled = true;
        fake.calls.push(text);
        return { rows: [], rowCount: 0 };
      }
      if (text.startsWith("SELECT id FROM users WHERE email") && insertUsersCalled) {
        fake.calls.push(text);
        return { rows: [{ id: 55 }], rowCount: 1 };
      }
      return original(text);
    };
    await ensureIdentity(fake.client, {
      user: { displayName: "أم محمد", email: "a@x.com", username: null },
      membership: {
        role: "parent",
        mosqueId: null,
        halaqahId: null,
        studentId: null,
        legacyKind: "parent",
        legacyId: "9",
        active: true,
      },
    });
    expect(fake.membershipCreated()).toBe(true); // عضوية الولي على صف الفائز 55
  });
});
