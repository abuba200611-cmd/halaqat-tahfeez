import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

/*
  «إنهاء جلسات الأجهزة الأخرى عند تغيير كلمة المرور» لمدير الجامع: نسخة الجلسة
  (session_version) تُدرج بالكوكي وتُفحص عند كل طلب. الكوكيات القديمة (٤ أجزاء
  بلا نسخة) تُقرأ كنسخة ٠ فتبقى صالحة إلى أن تتغيّر كلمة المرور.
*/

const SECRET = "test-secret-not-for-production";
beforeAll(() => {
  process.env.SESSION_SECRET = SECRET;
});

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (name === "mosque_admin_session" && jar.value ? { value: jar.value } : undefined),
    set: (_name: string, value: string) => {
      jar.value = value;
    },
    delete: () => {
      jar.value = undefined;
    },
  })),
}));

const dbState = vi.hoisted(() => ({ version: 0 as number | undefined }));
vi.mock("./db", () => ({
  sessionSecret: async () => "test-secret-not-for-production",
  findMosqueAdminById: vi.fn(async (id: number) => ({
    id,
    mosqueId: 5,
    username: "admin",
    ...(dbState.version === undefined ? {} : { sessionVersion: dbState.version }),
  })),
  mosqueAdminSessionVersion: vi.fn(async () => dbState.version ?? 0),
}));
vi.mock("./activity", () => ({ recordSeen: vi.fn(async () => undefined) }));

const auth = await import("./mosque-auth");

/** كوكي قديم بصيغة ما قبل النسخ: mosque_admin.<id>.<issued>.<sig> */
function legacyToken(adminId: number, issuedAt = Date.now()): string {
  const payload = `mosque_admin.${adminId}.${issuedAt}`;
  return `${payload}.${createHmac("sha256", SECRET).update(payload).digest("hex")}`;
}

beforeEach(() => {
  jar.value = undefined;
  dbState.version = 0;
});

describe("توكن جلسة مدير الجامع بنسخة", () => {
  it("ذهاب وإياب: المعرّف والنسخة", async () => {
    const token = await auth.createMosqueAdminSessionToken(7, 3);
    expect(token.split(".")).toHaveLength(5);
    expect(await auth.readMosqueAdminSession(token)).toEqual({ adminId: 7, sessionVersion: 3 });
    expect(await auth.readMosqueAdminSessionToken(token)).toBe(7);
  });

  it("الكوكي القديم بلا نسخة يُقرأ كنسخة ٠", async () => {
    expect(await auth.readMosqueAdminSession(legacyToken(7))).toEqual({ adminId: 7, sessionVersion: 0 });
  });

  it("تعديل النسخة بالحمولة يُبطل التوقيع (لا رفع/خفض يدوي)", async () => {
    const token = await auth.createMosqueAdminSessionToken(7, 0);
    const [tag, id, , issued, sig] = token.split(".");
    expect(await auth.readMosqueAdminSession([tag, id, "9", issued, sig].join("."))).toBeNull();
  });
});

describe("currentMosqueAdmin — فحص النسخة عند كل طلب", () => {
  it("كوكي قديم بلا نسخة يبقى صالحاً عند النشر (النسخة المخزّنة ٠)", async () => {
    jar.value = legacyToken(7);
    expect((await auth.currentMosqueAdmin())?.id).toBe(7);
  });

  it("حساب بلا عمود نسخة بعد (undefined) يُعامل كنسخة ٠", async () => {
    dbState.version = undefined;
    jar.value = legacyToken(7);
    expect((await auth.currentMosqueAdmin())?.id).toBe(7);
  });

  it("بعد تغيير كلمة المرور (النسخة ١) يُرفض الكوكي القديم والكوكي بنسخة ٠", async () => {
    dbState.version = 1;
    jar.value = legacyToken(7);
    expect(await auth.currentMosqueAdmin()).toBeNull();
    jar.value = await auth.createMosqueAdminSessionToken(7, 0);
    expect(await auth.currentMosqueAdmin()).toBeNull();
  });

  it("إعادة إصدار كوكي الجهاز الحالي بالنسخة الجديدة تُبقيه مسجّلاً", async () => {
    dbState.version = 1;
    await auth.setMosqueAdminSessionCookie(7); // يقرأ النسخة الحالية من القاعدة
    expect((await auth.currentMosqueAdmin())?.id).toBe(7);
  });

  it("كوكي من نسخة مستقبلية (أكبر من المخزّنة) مرفوض", async () => {
    dbState.version = 0;
    jar.value = await auth.createMosqueAdminSessionToken(7, 4);
    expect(await auth.currentMosqueAdmin()).toBeNull();
  });
});
