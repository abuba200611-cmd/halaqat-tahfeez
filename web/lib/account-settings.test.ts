import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX,
  MIN_PASSWORD_LENGTH,
  hasLocalPassword,
  normalizeDisplayName,
  validatePasswordChange,
} from "./account-settings";

describe("normalizeDisplayName — ٢–٦٠ حرفاً بعد القصّ", () => {
  it("يقصّ المسافات الطرفية ويقبل الاسم الصحيح", () => {
    expect(normalizeDisplayName("  أحمد بن علي  ")).toEqual({ ok: true, name: "أحمد بن علي" });
  });

  it("يرفض أقل من حرفين (بعد القصّ) أو الفارغ أو غير النص", () => {
    expect(normalizeDisplayName("أ").ok).toBe(false);
    expect(normalizeDisplayName("   ").ok).toBe(false);
    expect(normalizeDisplayName(" ب ").ok).toBe(false);
    expect(normalizeDisplayName(undefined).ok).toBe(false);
    expect(normalizeDisplayName(42).ok).toBe(false);
  });

  it("الحدّان: حرفان مقبول، ٦٠ مقبول، ٦١ مرفوض", () => {
    expect(normalizeDisplayName("عل").ok).toBe(true);
    expect(normalizeDisplayName("ا".repeat(DISPLAY_NAME_MAX)).ok).toBe(true);
    expect(normalizeDisplayName("ا".repeat(DISPLAY_NAME_MAX + 1)).ok).toBe(false);
  });

  it("يعدّ الحروف لا البايتات (إيموجي حرف واحد)", () => {
    expect(normalizeDisplayName("😀".repeat(DISPLAY_NAME_MAX)).ok).toBe(true);
  });

  it("يرفض محارف التحكم", () => {
    expect(normalizeDisplayName("أحمد\u0000x").ok).toBe(false);
    expect(normalizeDisplayName("أحمد\nعلي").ok).toBe(false);
  });
});

describe("hasLocalPassword — حساب جوجل فقط بلا كلمة مرور محلية", () => {
  it("صيغة salt:hash = محلية", () => {
    expect(hasLocalPassword("abcd:ef01")).toBe(true);
  });
  it("بصمة عشوائية بلا ':' (جوجل) أو فارغة = لا", () => {
    expect(hasLocalPassword("a".repeat(64))).toBe(false);
    expect(hasLocalPassword("")).toBe(false);
    expect(hasLocalPassword(null)).toBe(false);
    expect(hasLocalPassword("salt:")).toBe(false);
  });
});

describe("validatePasswordChange", () => {
  const good = { currentPassword: "old-password", newPassword: "new-password-1", confirmPassword: "new-password-1" };

  it("يقبل مدخلاً سليماً", () => {
    expect(validatePasswordChange(good)).toEqual({
      ok: true,
      input: { current: "old-password", next: "new-password-1", confirm: "new-password-1" },
    });
  });

  it("الحالية مطلوبة", () => {
    expect(validatePasswordChange({ ...good, currentPassword: "" }).ok).toBe(false);
  });

  it("الحدّ الأدنى نفسه حدّ التسجيل (٨)", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
    const short = "x".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validatePasswordChange({ ...good, newPassword: short, confirmPassword: short }).ok).toBe(false);
    const exact = "x".repeat(MIN_PASSWORD_LENGTH);
    expect(validatePasswordChange({ ...good, newPassword: exact, confirmPassword: exact }).ok).toBe(true);
  });

  it("التأكيد يجب أن يطابق، والجديدة يجب أن تختلف عن الحالية", () => {
    expect(validatePasswordChange({ ...good, confirmPassword: "different-one" }).ok).toBe(false);
    expect(
      validatePasswordChange({ ...good, newPassword: "old-password", confirmPassword: "old-password" }).ok,
    ).toBe(false);
  });

  it("قيم غير نصية = رفض", () => {
    expect(validatePasswordChange({ currentPassword: 1, newPassword: 2, confirmPassword: 3 }).ok).toBe(false);
  });
});
