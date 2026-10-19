import { describe, expect, it } from "vitest";
import {
  CHECKIN_GRACE_WINDOWS,
  CHECKIN_WINDOW_MS,
  checkinPath,
  createCheckinToken,
  verifyCheckinToken,
  windowEndsAt,
  windowOf,
} from "./qr-checkin";

const SECRET = "test-secret-aaaaaaaaaaaaaaaaaaaaaaaa";
const NOW = Date.UTC(2026, 9, 19, 9, 0, 10); // نافذة محددة
const TODAY = "2026-10-19";
const expectFor = (nowMs = NOW, halaqahId = 7, today = TODAY) => ({ halaqahId, today, nowMs });

describe("رمز الحضور — التوقيع والتحقق", () => {
  it("رمز سليم في نافذته يُقبل", () => {
    const t = createCheckinToken(SECRET, 7, TODAY, NOW);
    expect(verifyCheckinToken(SECRET, t, expectFor())).toEqual({ ok: true });
  });

  it("يدور كل ٣٠ ثانية: رمزان في نافذتين مختلفتين", () => {
    const a = createCheckinToken(SECRET, 7, TODAY, NOW);
    const b = createCheckinToken(SECRET, 7, TODAY, NOW + CHECKIN_WINDOW_MS);
    expect(a).not.toBe(b);
    // وداخل النافذة نفسها الرمز ثابت
    expect(createCheckinToken(SECRET, 7, TODAY, NOW + 1000)).toBe(
      createCheckinToken(SECRET, 7, TODAY, windowOf(NOW) * CHECKIN_WINDOW_MS),
    );
  });

  it("windowEndsAt نهاية النافذة الحالية", () => {
    expect(windowEndsAt(NOW)).toBeGreaterThan(NOW);
    expect(windowEndsAt(NOW) - NOW).toBeLessThanOrEqual(CHECKIN_WINDOW_MS);
  });

  it("يقبل حتى فترة السماح ثم ينتهي", () => {
    const t = createCheckinToken(SECRET, 7, TODAY, NOW);
    for (let k = 0; k <= CHECKIN_GRACE_WINDOWS; k++) {
      expect(verifyCheckinToken(SECRET, t, expectFor(NOW + k * CHECKIN_WINDOW_MS)).ok).toBe(true);
    }
    const late = verifyCheckinToken(SECRET, t, expectFor(NOW + (CHECKIN_GRACE_WINDOWS + 1) * CHECKIN_WINDOW_MS));
    expect(late).toEqual({ ok: false, reason: "expired" });
  });

  it("يرفض رمزاً من المستقبل", () => {
    const t = createCheckinToken(SECRET, 7, TODAY, NOW + 2 * CHECKIN_WINDOW_MS);
    expect(verifyCheckinToken(SECRET, t, expectFor())).toEqual({ ok: false, reason: "future" });
  });

  it("يرفض رمز حلقة أخرى (توقيعه سليم لكن الحلقة ليست حلقة الطالب)", () => {
    const t = createCheckinToken(SECRET, 8, TODAY, NOW);
    expect(verifyCheckinToken(SECRET, t, expectFor())).toEqual({ ok: false, reason: "wrong_halaqah" });
  });

  it("تبديل معرّف الحلقة في رمز موقّع = مزوَّر", () => {
    const t = createCheckinToken(SECRET, 8, TODAY, NOW).replace("v1.8.", "v1.7.");
    expect(verifyCheckinToken(SECRET, t, expectFor())).toEqual({ ok: false, reason: "forged" });
  });

  it("رمز ليوم آخر مرفوض", () => {
    const t = createCheckinToken(SECRET, 7, "2026-10-18", NOW);
    expect(verifyCheckinToken(SECRET, t, expectFor())).toEqual({ ok: false, reason: "wrong_date" });
  });

  it("توقيع بسرّ آخر مزوَّر", () => {
    const t = createCheckinToken("other-secret-bbbbbbbbbbbbbbbbbbbbbb", 7, TODAY, NOW);
    expect(verifyCheckinToken(SECRET, t, expectFor())).toEqual({ ok: false, reason: "forged" });
  });

  it("تعديل حرف في التوقيع أو النافذة = مزوَّر", () => {
    const t = createCheckinToken(SECRET, 7, TODAY, NOW);
    const last = t.slice(-1) === "0" ? "1" : "0";
    expect(verifyCheckinToken(SECRET, t.slice(0, -1) + last, expectFor()).ok).toBe(false);
    const parts = t.split(".");
    parts[3] = String(Number(parts[3]) + 1);
    expect(verifyCheckinToken(SECRET, parts.join("."), expectFor())).toEqual({ ok: false, reason: "forged" });
  });

  it.each([undefined, null, 5, {}, "", "abc", "v2.7.2026-10-19.1.aa", "v1.7.2026-10-19.1.zz", "x".repeat(500)])(
    "مدخل مشوّه %j",
    (bad) => {
      expect(verifyCheckinToken(SECRET, bad, expectFor())).toEqual({ ok: false, reason: "malformed" });
    },
  );

  it("المسار نسبي ومرمَّز", () => {
    expect(checkinPath("v1.7.2026-10-19.1.ab")).toBe("/student/checkin?t=v1.7.2026-10-19.1.ab");
  });
});
