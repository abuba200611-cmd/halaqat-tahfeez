import { describe, expect, it } from "vitest";
import { associationLoginStatusMessage, parseAssociationRegistrationBody } from "./association-registration";

const GOOD = {
  associationName: "جمعية الخير",
  registrationNumber: "",
  region: "الرياض",
  applicantName: "أحمد",
  phone: "0501234567",
  email: "A@B.co",
  username: "Khair",
  password: "secret123",
  confirmPassword: "secret123",
};

describe("parseAssociationRegistrationBody — التحقق الخادمي", () => {
  it("طلب سليم: يُقلَّم ويُصغَّر البريد واسم المستخدم، والترخيص اختياري", () => {
    const parsed = parseAssociationRegistrationBody(GOOD);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.email).toBe("a@b.co");
      expect(parsed.value.username).toBe("khair");
      expect(parsed.value.registrationNumber).toBe("");
    }
  });

  it.each([
    ["associationName", { associationName: "ا" }],
    ["region", { region: "" }],
    ["applicantName", { applicantName: " " }],
    ["phone", { phone: "12ab" }],
    ["email", { email: "no-at" }],
    ["username", { username: "A B" }],
    ["password", { password: "short", confirmPassword: "short" }],
    ["confirm", { confirmPassword: "different1" }],
    ["registrationNumber", { registrationNumber: "x".repeat(41) }],
  ])("حقل غير صالح يُرفض باسمه: %s", (field, over) => {
    const parsed = parseAssociationRegistrationBody({ ...GOOD, ...over });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.field).toBe(field);
  });

  it("جسم غير كائن لا يرمي", () => {
    expect(parseAssociationRegistrationBody(null).ok).toBe(false);
    expect(parseAssociationRegistrationBody("x").ok).toBe(false);
  });
});

describe("associationLoginStatusMessage", () => {
  it("معلّق وبسبب رفض", () => {
    expect(associationLoginStatusMessage("pending", null)).toContain("قيد المراجعة");
    expect(associationLoginStatusMessage("rejected", "بيانات ناقصة")).toContain("بيانات ناقصة");
    expect(associationLoginStatusMessage("rejected", null)).toContain("رفض");
  });
});
