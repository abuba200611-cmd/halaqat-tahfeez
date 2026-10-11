import { createHmac } from "node:crypto";
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
  it("يقرأ نفس معرّف المعلّم ونسخة الجلسة التي وُقّع بها الرمز", async () => {
    const token = await createSessionToken(42, 3);
    expect(await readSessionToken(token)).toEqual({ teacherId: 42, sessionVersion: 3 });
  });

  it("يرفض رمزاً موقّعاً بسرّ مختلف (توقيع غير صالح)", async () => {
    const token = await createSessionToken(1, 0);
    const tampered = token.slice(0, -4) + "0000";
    expect(await readSessionToken(tampered)).toBeNull();
  });

  it("يرفض رمزاً بصيغة ناقصة", async () => {
    expect(await readSessionToken("not.a.valid.token.format")).toBeNull();
    expect(await readSessionToken("")).toBeNull();
  });

  it("رمز قديم بلا نسخة جلسة (٣ أجزاء) يُقبل كنسخة ٠ — لا يُخرج مستخدمي اليوم", async () => {
    const payload = `42.${Date.now()}`;
    const signature = createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("hex");
    expect(await readSessionToken(`${payload}.${signature}`)).toEqual({ teacherId: 42, sessionVersion: 0 });
  });

  it("رمز جديد بنسخة ٠ يُقبل أيضاً (حساب لم تُبطل جلساته أبداً)", async () => {
    const token = await createSessionToken(42, 0);
    expect(await readSessionToken(token)).toEqual({ teacherId: 42, sessionVersion: 0 });
  });
});
