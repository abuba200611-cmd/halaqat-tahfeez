import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const { createSuperAdminSessionToken, readSuperAdminSessionToken } = await import("./super-admin-auth");

describe("createSuperAdminSessionToken / readSuperAdminSessionToken", () => {
  it("يقرأ نفس معرّف المشرف العام الذي وُقّع به الرمز", async () => {
    const token = await createSuperAdminSessionToken(3);
    expect(await readSuperAdminSessionToken(token)).toBe(3);
  });

  it("يرفض رمزاً موقّعاً بسرّ مختلف (توقيع غير صالح)", async () => {
    const token = await createSuperAdminSessionToken(1);
    const tampered = token.slice(0, -4) + "0000";
    expect(await readSuperAdminSessionToken(tampered)).toBeNull();
  });

  it("يرفض رمزاً بصيغة ناقصة", async () => {
    expect(await readSuperAdminSessionToken("not.a.valid.token.format")).toBeNull();
    expect(await readSuperAdminSessionToken("")).toBeNull();
  });

  it("يرفض رمز جلسة مدير جامع — الوسم مختلف", async () => {
    const fakeMosqueAdminLikeToken = "mosque_admin.1.123456789.deadbeef";
    expect(await readSuperAdminSessionToken(fakeMosqueAdminLikeToken)).toBeNull();
  });
});
