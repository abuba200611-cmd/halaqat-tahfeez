import { beforeAll, describe, expect, it } from "vitest";

// يثبّت سرّ الجلسة عبر البيئة قبل الاستيراد، فيتفادى sessionSecret() أي
// اتصال حقيقي بقاعدة البيانات أثناء الاختبار — نفس نمط lib/auth.test.ts.
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const { createMosqueAdminSessionToken, readMosqueAdminSessionToken } = await import("./mosque-auth");

describe("createMosqueAdminSessionToken / readMosqueAdminSessionToken", () => {
  it("يقرأ نفس معرّف مدير الجامع الذي وُقّع به الرمز", async () => {
    const token = await createMosqueAdminSessionToken(7);
    expect(await readMosqueAdminSessionToken(token)).toBe(7);
  });

  it("يرفض رمزاً موقّعاً بسرّ مختلف (توقيع غير صالح)", async () => {
    const token = await createMosqueAdminSessionToken(1);
    const tampered = token.slice(0, -4) + "0000";
    expect(await readMosqueAdminSessionToken(tampered)).toBeNull();
  });

  it("يرفض رمزاً بصيغة ناقصة", async () => {
    expect(await readMosqueAdminSessionToken("not.a.valid.token.format")).toBeNull();
    expect(await readMosqueAdminSessionToken("")).toBeNull();
  });

  it("يرفض رمز جلسة طالب/معلّم — الوسم مختلف", async () => {
    // يحاكي توكناً موقّعاً بنفس السرّ لكن ببادئة مختلفة، للتأكد من عزل الأنواع
    const fakeStudentLikeToken = "student.1.123456789.deadbeef";
    expect(await readMosqueAdminSessionToken(fakeStudentLikeToken)).toBeNull();
  });
});
