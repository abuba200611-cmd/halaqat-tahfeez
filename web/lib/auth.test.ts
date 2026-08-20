import { beforeAll, describe, expect, it } from "vitest";

// يثبّت سرّ الجلسة عبر البيئة قبل الاستيراد، فيتفادى sessionSecret() أي
// اتصال حقيقي بقاعدة البيانات أثناء الاختبار.
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const { hashPassword, verifyPassword, createSessionToken, readSessionToken } = await import("./auth");

describe("hashPassword / verifyPassword", () => {
  it("يتحقق من كلمة المرور الصحيحة", () => {
    const hash = hashPassword("my-secret-password");
    expect(verifyPassword("my-secret-password", hash)).toBe(true);
  });

  it("يرفض كلمة مرور خاطئة", () => {
    const hash = hashPassword("my-secret-password");
    expect(verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("يولّد ملحاً مختلفاً في كل مرة — نفس كلمة المرور تعطي هاشاً مختلفاً", () => {
    const a = hashPassword("same-password");
    const b = hashPassword("same-password");
    expect(a).not.toBe(b);
  });

  it("لا ينهار على مدخل تالف بدل الرمز المتوقّع", () => {
    expect(verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});

describe("createSessionToken / readSessionToken", () => {
  it("يقرأ نفس معرّف المعلّم الذي وُقّع به الرمز", async () => {
    const token = await createSessionToken(42);
    expect(await readSessionToken(token)).toBe(42);
  });

  it("يرفض رمزاً موقّعاً بسرّ مختلف (توقيع غير صالح)", async () => {
    const token = await createSessionToken(1);
    const tampered = token.slice(0, -4) + "0000";
    expect(await readSessionToken(tampered)).toBeNull();
  });

  it("يرفض رمزاً بصيغة ناقصة", async () => {
    expect(await readSessionToken("not.a.valid.token.format")).toBeNull();
    expect(await readSessionToken("")).toBeNull();
  });
});
