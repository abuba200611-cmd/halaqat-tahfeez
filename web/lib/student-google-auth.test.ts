import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const { createStudentGooglePendingToken, readStudentGooglePendingToken } = await import(
  "./student-google-auth"
);

describe("createStudentGooglePendingToken / readStudentGooglePendingToken", () => {
  it("يقرأ نفس sub والبريد اللذين وُقّع بهما التوكن", async () => {
    const token = await createStudentGooglePendingToken("google-sub-123", "student@example.com");
    expect(await readStudentGooglePendingToken(token)).toEqual({
      sub: "google-sub-123",
      email: "student@example.com",
    });
  });

  it("يرفض توكناً موقّعاً بسرّ مختلف (توقيع غير صالح)", async () => {
    const token = await createStudentGooglePendingToken("google-sub-123", "student@example.com");
    const tampered = token.slice(0, -4) + "0000";
    expect(await readStudentGooglePendingToken(tampered)).toBeNull();
  });

  it("يرفض توكناً بصيغة ناقصة", async () => {
    expect(await readStudentGooglePendingToken("not.a.valid.token")).toBeNull();
    expect(await readStudentGooglePendingToken("")).toBeNull();
  });

  it("يرفض توكن جلسة من نوع آخر — الوسم مختلف", async () => {
    const fakeMosqueAdminLikeToken = "mosque_admin.1.123456789.deadbeef";
    expect(await readStudentGooglePendingToken(fakeMosqueAdminLikeToken)).toBeNull();
  });
});
