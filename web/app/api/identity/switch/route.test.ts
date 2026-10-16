import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  M5 — اختبار مسار تبديل الدور /api/identity/switch:
  - يرفض عضويات أشخاص آخرين بنفس ردّ «غير موجودة» (لا كشف للوجود).
  - لا يصدر كوكي نوعٍ إلا لجلسة من النوع نفسه (لا تصعيد أبداً) — الأنواع
    الأخرى تُرجع رابط دخولها معبَّأً.
  - قبل الإصدار يتحقق من الصف القديم الحي (معلّم موقوف = رفض).
*/

vi.mock("@/lib/identity", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/identity")>();
  return { ...actual, resolveIdentity: vi.fn(), findMembershipById: vi.fn() };
});
vi.mock("@/lib/db", () => ({
  db: vi.fn(),
  findTeacherById: vi.fn(),
  findStudentAccount: vi.fn(),
  findMosqueAdminById: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ setSessionCookie: vi.fn(), setStudentSessionCookie: vi.fn() }));
vi.mock("@/lib/parent-auth", () => ({ setParentSessionCookie: vi.fn() }));
vi.mock("@/lib/mosque-auth", () => ({ setMosqueAdminSessionCookie: vi.fn() }));
vi.mock("@/lib/dev-impersonation", () => ({ guardImpersonation: vi.fn().mockResolvedValue(null) }));

import { POST as switchRole } from "@/app/api/identity/switch/route";
import { guardImpersonation } from "@/lib/dev-impersonation";
import { setSessionCookie, setStudentSessionCookie } from "@/lib/auth";
import { setParentSessionCookie } from "@/lib/parent-auth";
import { setMosqueAdminSessionCookie } from "@/lib/mosque-auth";
import { findMembershipById, resolveIdentity, type Membership } from "@/lib/identity";
import { findStudentAccount, findTeacherById } from "@/lib/db";

function membership(overrides: Partial<Membership> = {}): Membership {
  return {
    id: 10,
    userId: 42,
    role: "parent",
    mosqueId: null,
    halaqahId: null,
    studentId: null,
    legacyKind: "parent",
    legacyId: "9",
    active: true,
    halaqahName: null,
    mosqueName: null,
    ...overrides,
  };
}

/** جلسة معلّم حالية للمستخدم 42 */
function teacherSession() {
  return {
    kind: "teacher" as const,
    user: { id: 42, displayName: "أحمد", email: "a@x.com", username: null },
    current: membership({
      id: 1,
      role: "supervisor",
      legacyKind: "teacher",
      legacyId: "7",
      halaqahId: 3,
    }),
    memberships: [],
  };
}

function call(body: unknown) {
  return switchRole(new Request("http://localhost/api/identity/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(resolveIdentity).mockResolvedValue(teacherSession());
});

describe("الملكية — عضويات الآخرين لا تُبدَّل ولا يُكشف وجودها", () => {
  it("عضوية مستخدم آخر = نفس ردّ العضوية غير الموجودة تماماً", async () => {
    vi.mocked(findMembershipById).mockResolvedValueOnce(membership({ userId: 999 }));
    const foreign = await call({ membershipId: 10 });

    vi.mocked(findMembershipById).mockResolvedValueOnce(null);
    const missing = await call({ membershipId: 10 });

    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("عضويتي لكنها موقوفة = نفس الرفض", async () => {
    vi.mocked(findMembershipById).mockResolvedValueOnce(membership({ active: false }));
    const res = await call({ membershipId: 10 });
    expect(res.status).toBe(404);
  });

  it("بلا جلسة = 401", async () => {
    vi.mocked(resolveIdentity).mockResolvedValue({ kind: null, user: null, current: null, memberships: [] });
    const res = await call({ membershipId: 10 });
    expect(res.status).toBe(401);
  });

  it("أثناء «عرض كـ»: ردّ الحارس نفسه ولا يُصدر أي كوكي", async () => {
    const blocked = Response.json({ error: "هذا الإجراء غير متاح أثناء «عرض كـ»" }, { status: 403 });
    vi.mocked(guardImpersonation).mockResolvedValueOnce(blocked);
    const res = await call({ membershipId: 10 });
    expect(res).toBe(blocked);
    expect(resolveIdentity).not.toHaveBeenCalled();
    expect(setSessionCookie).not.toHaveBeenCalled();
  });
});

describe("لا تصعيد — الأنواع الأخرى لا تُصدِر كوكيها", () => {
  it("معلّم يطلب عضوية ولي أمر لنفس المستخدم: 403 + رابط دخول معبَّأ، ولا كوكي", async () => {
    vi.mocked(findMembershipById).mockResolvedValueOnce(membership()); // parent للمستخدم 42 نفسه
    const res = await call({ membershipId: 10 });
    const data = (await res.json()) as { loginHref?: string };

    expect(res.status).toBe(403);
    expect(data.loginHref).toContain("/parent/login?email=");
    expect(setParentSessionCookie).not.toHaveBeenCalled();
  });

  it("معلّم يطلب عضوية مدير جامع: رابط /mosque-login معبَّأً", async () => {
    vi.mocked(findMembershipById).mockResolvedValueOnce(
      membership({ role: "mosque_admin", legacyKind: "mosque_admin", legacyId: "4", mosqueId: 11 }),
    );
    const res = await call({ membershipId: 10 });
    const data = (await res.json()) as { loginHref?: string };
    expect(res.status).toBe(403);
    expect(data.loginHref).toContain("/mosque-login?username=");
    expect(setMosqueAdminSessionCookie).not.toHaveBeenCalled();
  });
});

describe("التبديل المسموح — نفس نوع الجلسة بعد التحقق من الصف الحي", () => {
  it("معلّم → عضوية معلّم أخرى: يصدر كوكي المعلّم ويعيد وجهة القشرة", async () => {
    vi.mocked(findMembershipById).mockResolvedValueOnce(
      membership({ id: 2, role: "assistant", legacyKind: "teacher", legacyId: "8", halaqahId: 5 }),
    );
    vi.mocked(findTeacherById).mockResolvedValueOnce({
      id: 8,
      username: "b@x.com",
      teacherName: "سعد",
      halaqahId: 5,
      halaqahName: "حلقة العصر",
      role: "assistant",
      emailVerified: true,
      sessionVersion: 0,
      deactivatedAt: null,
    });
    const res = await call({ membershipId: 2 });
    const data = (await res.json()) as { ok?: boolean; redirect?: string };

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.redirect).toBe("/");
    expect(setSessionCookie).toHaveBeenCalledWith(8);
  });

  it("معلّم موقوف = رفض رغم صحة العضوية", async () => {
    vi.mocked(findMembershipById).mockResolvedValueOnce(
      membership({ id: 2, role: "assistant", legacyKind: "teacher", legacyId: "8" }),
    );
    vi.mocked(findTeacherById).mockResolvedValueOnce({
      id: 8,
      username: "b@x.com",
      teacherName: "سعد",
      halaqahId: 5,
      halaqahName: "حلقة",
      role: "assistant",
      emailVerified: true,
      sessionVersion: 0,
      deactivatedAt: "2026-10-01",
    });
    const res = await call({ membershipId: 2 });
    expect(res.status).toBe(404);
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("جلسة طالب → عضوية طالب أخرى بنفس المستخدم: كوكي الطالب بالمفتاح المركّب", async () => {
    vi.mocked(resolveIdentity).mockResolvedValue({
      kind: "student",
      user: { id: 42, displayName: "خالد", email: null, username: "khalid01" },
      current: membership({ id: 1, role: "student", legacyKind: "student", legacyId: "3:abc", studentId: "abc", halaqahId: 3 }),
      memberships: [],
    });
    vi.mocked(findMembershipById).mockResolvedValueOnce(
      membership({ id: 2, role: "student", legacyKind: "student", legacyId: "5:xyz", studentId: "xyz", halaqahId: 5 }),
    );
    vi.mocked(findStudentAccount).mockResolvedValueOnce({
      teacherId: 5,
      id: "xyz",
      name: "خالد",
      halaqahName: "حلقة ثانية",
      sessionVersion: 0,
    });
    const res = await call({ membershipId: 2 });
    expect(res.status).toBe(200);
    expect(setStudentSessionCookie).toHaveBeenCalledWith(5, "xyz");
  });

  it("مفتاح طالب فاسد (بلا فاصل) = رفض بلا استعلام", async () => {
    vi.mocked(resolveIdentity).mockResolvedValue({
      kind: "student",
      user: { id: 42, displayName: "خالد", email: null, username: "khalid01" },
      current: membership({ id: 1, role: "student", legacyKind: "student", legacyId: "3:abc" }),
      memberships: [],
    });
    vi.mocked(findMembershipById).mockResolvedValueOnce(
      membership({ id: 2, role: "student", legacyKind: "student", legacyId: "فاسد" }),
    );
    const res = await call({ membershipId: 2 });
    expect(res.status).toBe(404);
    expect(findStudentAccount).not.toHaveBeenCalled();
  });
});
