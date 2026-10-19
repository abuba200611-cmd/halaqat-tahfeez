import { describe, expect, it } from "vitest";
import { GOOGLE_HANDOFF_TTL_SECONDS, signGoogleHandoff, verifyGoogleHandoff } from "./google-handoff";

const SECRET = "test-secret-not-for-production";
const HANDOFF = { email: "new@example.com", name: "جديد" };

describe("تسليم جوجل الموقّع", () => {
  it("رمز سليم: يُقرأ البريد والاسم", () => {
    const token = signGoogleHandoff(HANDOFF, SECRET, 1_000);
    expect(verifyGoogleHandoff(token, SECRET, 2_000)).toEqual(HANDOFF);
  });

  it("منتهي الصلاحية (بعد ١٠ دقائق): مرفوض", () => {
    const token = signGoogleHandoff(HANDOFF, SECRET, 1_000);
    const justAfter = 1_000 + GOOGLE_HANDOFF_TTL_SECONDS * 1000 + 1;
    expect(verifyGoogleHandoff(token, SECRET, justAfter)).toBeNull();
  });

  it("تغيير البريد داخل الحمولة مع إبقاء التوقيع: مرفوض", () => {
    const token = signGoogleHandoff(HANDOFF, SECRET, 1_000);
    const [, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ e: "victim@example.com", n: "x", x: Date.now() + 1e9 }),
    ).toString("base64url");
    expect(verifyGoogleHandoff(`${forged}.${sig}`, SECRET, 2_000)).toBeNull();
  });

  it("توقيع بسرّ آخر أو رمز تالف: مرفوض", () => {
    const token = signGoogleHandoff(HANDOFF, "other-secret", 1_000);
    expect(verifyGoogleHandoff(token, SECRET, 2_000)).toBeNull();
    expect(verifyGoogleHandoff("garbage", SECRET)).toBeNull();
    expect(verifyGoogleHandoff("a.b.c", SECRET)).toBeNull();
    expect(verifyGoogleHandoff("", SECRET)).toBeNull();
  });
});
