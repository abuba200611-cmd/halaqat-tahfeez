import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  M5 — اختبار الدخول الموحّد /api/login:
  - الترتيب الثابت: معلّم ← مدير جامع ← ولي أمر (الطالب خارج المسار عمداً).
  - لا عدّ للحسابات: كل فشل (غير موجود / كلمة خاطئة / معلّم موقوف بكلمة
    صحيحة) يرجع الرسالة والحالة نفسيهما حرفياً.
*/

vi.mock("@/lib/db", () => ({
  findTeacherByUsername: vi.fn(),
  checkLoginRateLimit: vi.fn(),
  recordFailedLoginAttempt: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({
  verifyPassword: vi.fn((password: string, stored: string) => password === stored),
  setSessionCookie: vi.fn(),
}));
vi.mock("@/lib/parent-db", () => ({
  findParentByEmail: vi.fn(),
  isValidParentEmail: (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  normalizeParentEmail: (email: string) => email.trim().toLowerCase(),
}));
vi.mock("@/lib/parent-auth", () => ({ setParentSessionCookie: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({ findMosqueAdminByUsername: vi.fn() }));
vi.mock("@/lib/mosque-auth", () => ({ setMosqueAdminSessionCookie: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  peekRateLimit: vi.fn().mockResolvedValue(true),
  rateLimited: () => Response.json({ error: "محاولات كثيرة" }, { status: 429 }),
  recordRateLimitHit: vi.fn(),
}));

import { POST as unifiedLogin } from "@/app/api/login/route";
import { setSessionCookie } from "@/lib/auth";
import { checkLoginRateLimit, findTeacherByUsername } from "@/lib/db";
import { setParentSessionCookie } from "@/lib/parent-auth";
import { findParentByEmail } from "@/lib/parent-db";
import { setMosqueAdminSessionCookie } from "@/lib/mosque-auth";
import { findMosqueAdminByUsername } from "@/lib/mosque/db";

const TEACHER = {
  id: 7,
  username: "a@x.com",
  passwordHash: "secret",
  teacherName: "أحمد",
  halaqahId: 3,
  halaqahName: "حلقة الفجر",
  role: "supervisor" as const,
  emailVerified: true,
  sessionVersion: 0,
  deactivatedAt: null as string | null,
};

const PARENT = { id: 9, email: "a@x.com", name: "ولي", sessionVersion: 0, passwordHash: "secret" };
const ADMIN = { id: 4, mosqueId: 11, username: "admin11", passwordHash: "secret" };

function call(identifier: string, password: string) {
  return unifiedLogin(new Request("http://localhost/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findTeacherByUsername).mockResolvedValue(null);
  vi.mocked(findMosqueAdminByUsername).mockResolvedValue(null);
  vi.mocked(findParentByEmail).mockResolvedValue(null);
  vi.mocked(checkLoginRateLimit).mockResolvedValue(true);
});

describe("الترتيب الثابت للأنواع", () => {
  it("معلّم متطابق أولاً: كوكي المعلّم ووجهة القشرة", async () => {
    vi.mocked(findTeacherByUsername).mockResolvedValue({ ...TEACHER });
    const res = await call("A@X.COM", "secret");
    const data = (await res.json()) as { kind?: string; redirect?: string };

    expect(res.status).toBe(200);
    expect(data.kind).toBe("teacher");
    expect(data.redirect).toBe("/");
    expect(setSessionCookie).toHaveBeenCalledWith(7);
    // المعرّف صُغّر قبل البحث
    expect(findTeacherByUsername).toHaveBeenCalledWith("a@x.com");
  });

  it("كلمة المعلّم خاطئة والولي متطابق بنفس البريد: تُضبط جلسة الولي", async () => {
    vi.mocked(findTeacherByUsername).mockResolvedValue({ ...TEACHER, passwordHash: "غيره" });
    vi.mocked(findParentByEmail).mockResolvedValue({ ...PARENT });
    const res = await call("a@x.com", "secret");
    const data = (await res.json()) as { kind?: string };

    expect(res.status).toBe(200);
    expect(data.kind).toBe("parent");
    expect(setParentSessionCookie).toHaveBeenCalledWith(9);
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("مدير الجامع يُطابق قبل الولي عندما لا يوجد معلّم", async () => {
    vi.mocked(findMosqueAdminByUsername).mockResolvedValue({ ...ADMIN });
    const res = await call("admin11", "secret");
    const data = (await res.json()) as { kind?: string; redirect?: string };

    expect(res.status).toBe(200);
    expect(data.kind).toBe("mosque_admin");
    expect(data.redirect).toBe("/mosque/11");
    expect(setMosqueAdminSessionCookie).toHaveBeenCalledWith(4);
  });

  it("معرّف ليس بريداً: لا يُبحث عن ولي أمر إطلاقاً", async () => {
    await call("someuser", "secret");
    expect(findParentByEmail).not.toHaveBeenCalled();
  });
});

describe("لا عدّ للحسابات — كل الفشل ردٌّ واحد", () => {
  it("نفس الرسالة والحالة للفشل بأي سبب", async () => {
    // ١) لا حسابات إطلاقاً
    const unknown = await call("nobody@x.com", "secret");

    // ٢) معلّم موجود بكلمة خاطئة
    vi.mocked(findTeacherByUsername).mockResolvedValue({ ...TEACHER, passwordHash: "غيره" });
    const wrongPassword = await call("a@x.com", "wrong");

    // ٣) ولي أمر موجود بكلمة خاطئة
    vi.mocked(findTeacherByUsername).mockResolvedValue(null);
    vi.mocked(findParentByEmail).mockResolvedValue({ ...PARENT, passwordHash: "غيره" });
    const wrongParent = await call("a@x.com", "wrong");

    // ٤) معلّم موقوف بكلمة صحيحة — لا رسالة إيقاف هنا (مساره الأصلي وحده يخبره)
    vi.mocked(findParentByEmail).mockResolvedValue(null);
    vi.mocked(findTeacherByUsername).mockResolvedValue({ ...TEACHER, deactivatedAt: "2026-10-01" });
    const deactivated = await call("a@x.com", "secret");

    for (const res of [unknown, wrongPassword, wrongParent, deactivated]) {
      expect(res.status).toBe(401);
    }
    const [b1, b2, b3, b4] = await Promise.all([
      unknown.json(),
      wrongPassword.json(),
      wrongParent.json(),
      deactivated.json(),
    ]);
    expect(b1).toEqual(b2);
    expect(b1).toEqual(b3);
    expect(b1).toEqual(b4);
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("تجاوز حدّ المحاولات بالـIP = 429 قبل أي بحث", async () => {
    vi.mocked(checkLoginRateLimit).mockResolvedValue(false);
    const res = await call("a@x.com", "secret");
    expect(res.status).toBe(429);
    expect(findTeacherByUsername).not.toHaveBeenCalled();
  });
});
