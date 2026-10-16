import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  «عرض كـ» (M3) — صلاحية التوكن، انتهاء الـ١٥ دقيقة، علم الشريط
  (currentImpersonation)، حارس المسارات الهدّامة، و«الإنهاء» يمسح كوكي
  الدور الصحيح حتى بعد الانتهاء.
*/

const jar = vi.hoisted(() => ({} as Record<string, string | undefined>));
const sqlMock = vi.hoisted(() => vi.fn());

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ sql: sqlMock }),
}));

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

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const { createImpersonationToken, readImpersonationToken, currentImpersonation, guardImpersonation, endImpersonation } =
  await import("./dev-impersonation");

function sign(payload: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("hex");
}

/** يبني توكن بخيارات زمنية يدوية — لاختبار الانتهاء دون انتظار ١٥ دقيقة */
function craftToken(kind: string, targetId: number, adminId: number, issuedAt: number, expiresAt: number): string {
  const payload = `imp.${kind}.${targetId}.${adminId}.${issuedAt}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

beforeEach(() => {
  for (const key of Object.keys(jar)) delete jar[key];
});

describe("توكن «عرض كـ»", () => {
  it("دورة كاملة: الإنشاء ثم القراءة ترجع الادعاء كما هو", async () => {
    const { token } = await createImpersonationToken("teacher", 42, 0);
    const info = await readImpersonationToken(token);
    expect(info).toMatchObject({ kind: "teacher", targetId: 42, adminId: 0 });
    expect(info!.expiresAt).toBeGreaterThan(Date.now());
  });

  it("توكن منتهي يُرفض — والسماح بالمنتهي يعمل لغرض «الإنهاء» فقط", async () => {
    const expired = craftToken("mosque_admin", 3, 0, Date.now() - 20 * 60 * 1000, Date.now() - 5 * 60 * 1000);
    expect(await readImpersonationToken(expired)).toBeNull();
    expect(await readImpersonationToken(expired, true)).toMatchObject({ kind: "mosque_admin", targetId: 3 });
  });

  it("توقيع مزوَّر أو وسوم غريبة تُرفض", async () => {
    const good = craftToken("teacher", 1, 0, Date.now(), Date.now() + 60_000);
    const forged = `${good.slice(0, -1)}${good.endsWith("0") ? "1" : "0"}`;
    expect(await readImpersonationToken(forged)).toBeNull();

    const wrongTag = craftToken("student", 1, 0, Date.now(), Date.now() + 60_000).replace("imp.", "other.");
    const parts = wrongTag.split(".");
    const reSigned = [...parts.slice(0, -1), sign(parts.slice(0, -1).join("."))].join(".");
    expect(await readImpersonationToken(reSigned)).toBeNull();
  });
});

describe("علم الشريط والحارس", () => {
  it("بلا كوكي: currentImpersonation فارغ والحارس يمرر (null)", async () => {
    expect(await currentImpersonation()).toBeNull();
    expect(await guardImpersonation()).toBeNull();
  });

  it("كوكي صالح: الشريط يظهر والحارس يرجع 403", async () => {
    jar.dev_imp = craftToken("teacher", 42, 0, Date.now(), Date.now() + 60_000);
    expect(await currentImpersonation()).toMatchObject({ kind: "teacher", targetId: 42 });
    const blocked = await guardImpersonation();
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(403);
  });

  it("كوكي منتهٍ: لا شريط ولا حجب — انتهت النافذة انتهى الانتحال", async () => {
    jar.dev_imp = craftToken("teacher", 42, 0, Date.now() - 20 * 60 * 1000, Date.now() - 60_000);
    expect(await currentImpersonation()).toBeNull();
    expect(await guardImpersonation()).toBeNull();
  });
});

describe("الإنهاء", () => {
  it("يمسح كوكي الادعاء وكوكي جلسة الدور المنتحَل", async () => {
    jar.dev_imp = craftToken("teacher", 42, 0, Date.now() - 20 * 60 * 1000, Date.now() - 60_000);
    jar.halaqa_session = "role-cookie";
    const info = await endImpersonation();
    expect(info).toMatchObject({ kind: "teacher", targetId: 42 });
    expect(jar.dev_imp).toBeUndefined();
    expect(jar.halaqa_session).toBeUndefined();
  });

  it("لمدير الجامع يمسح كوكي mosque_admin_session", async () => {
    jar.dev_imp = craftToken("mosque_admin", 3, 0, Date.now(), Date.now() + 60_000);
    jar.mosque_admin_session = "role-cookie";
    await endImpersonation();
    expect(jar.mosque_admin_session).toBeUndefined();
  });
});
