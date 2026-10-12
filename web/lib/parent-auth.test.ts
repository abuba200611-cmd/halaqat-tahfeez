import { beforeAll, describe, expect, it } from "vitest";

// يثبّت سرّ الجلسة عبر البيئة قبل الاستيراد (لا اتصال بقاعدة بيانات)
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const { createParentSessionToken, readParentSessionToken } = await import("./parent-auth");
const { createSessionToken, readSessionToken, createStudentSessionToken, readStudentSessionToken } =
  await import("./auth");

describe("جلسة ولي الأمر (STEP 61)", () => {
  it("يقرأ نفس الهوية ونسخة الجلسة", async () => {
    const token = await createParentSessionToken(7, 2);
    expect(await readParentSessionToken(token)).toEqual({ parentId: 7, sessionVersion: 2 });
  });

  it("يرفض رمزاً معدَّلاً أو ناقصاً", async () => {
    const token = await createParentSessionToken(7, 0);
    expect(await readParentSessionToken(token.slice(0, -4) + "0000")).toBeNull();
    expect(await readParentSessionToken("parent.7")).toBeNull();
    expect(await readParentSessionToken("")).toBeNull();
  });

  it("رمز ولي الأمر لا يُقبل عند حرّاس المعلّم ولا الطالب", async () => {
    const token = await createParentSessionToken(7, 0);
    expect(await readSessionToken(token)).toBeNull();
    expect(await readStudentSessionToken(token)).toBeNull();
  });

  it("رمز المعلّم أو الطالب لا يُقبل عند حارس ولي الأمر", async () => {
    expect(await readParentSessionToken(await createSessionToken(7, 0))).toBeNull();
    expect(await readParentSessionToken(await createStudentSessionToken(7, "s1", 0))).toBeNull();
  });

  it("تبديل الوسم يُبطل التوقيع (الوسم داخل الجزء الموقَّع)", async () => {
    const forged = (await createParentSessionToken(7, 0)).replace(/^parent\./, "student.");
    expect(await readParentSessionToken(forged)).toBeNull();
    expect(await readStudentSessionToken(forged)).toBeNull();
  });
});
