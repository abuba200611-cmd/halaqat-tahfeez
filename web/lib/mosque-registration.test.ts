import { describe, expect, it } from "vitest";
import { loginStatusMessage, parseMosqueRegistrationBody, parseRejectReason } from "./mosque-registration";

const GOOD = {
  mosqueName: "جامع النور",
  city: "حي الربيع",
  applicantName: "أحمد",
  phone: "0501234567",
  email: "Ahmad@Example.com",
  username: "Noor_Mosque",
  password: "secret123",
  confirmPassword: "secret123",
  associationName: "",
};

describe("parseMosqueRegistrationBody — التحقق من طلب تسجيل جامع", () => {
  it("طلب سليم: يطبّع البريد واسم المستخدم ويقصّ الفراغات", () => {
    const r = parseMosqueRegistrationBody({ ...GOOD, mosqueName: "  جامع النور ", phone: "050 123-4567" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.mosqueName).toBe("جامع النور");
    expect(r.value.email).toBe("ahmad@example.com");
    expect(r.value.username).toBe("noor_mosque");
    expect(r.value.phone).toBe("0501234567");
  });

  it("المدينة والجمعية اختياريتان", () => {
    expect(parseMosqueRegistrationBody({ ...GOOD, city: "", associationName: "" }).ok).toBe(true);
  });

  const bad: [string, Record<string, unknown>, string][] = [
    ["اسم جامع قصير", { mosqueName: "ج" }, "mosqueName"],
    ["اسم جامع طويل", { mosqueName: "ج".repeat(101) }, "mosqueName"],
    ["مدينة طويلة", { city: "م".repeat(61) }, "city"],
    ["مقدّم بلا اسم", { applicantName: " " }, "applicantName"],
    ["جوال قصير", { phone: "123" }, "phone"],
    ["جوال بحروف", { phone: "05012abc67" }, "phone"],
    ["بريد بلا @", { email: "nope" }, "email"],
    ["اسم مستخدم عربي", { username: "نور" }, "username"],
    ["اسم مستخدم بمسافة", { username: "a b c" }, "username"],
    ["اسم مستخدم قصير", { username: "ab" }, "username"],
    ["كلمة مرور قصيرة", { password: "short", confirmPassword: "short" }, "password"],
    ["تأكيد غير مطابق", { confirmPassword: "different1" }, "confirm"],
    ["جمعية طويلة", { associationName: "ج".repeat(101) }, "associationName"],
  ];
  for (const [title, patch, field] of bad) {
    it(`يرفض: ${title}`, () => {
      const r = parseMosqueRegistrationBody({ ...GOOD, ...patch });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.field).toBe(field);
    });
  }

  it("جسم غير كائن أو حقول غير نصية → يرفض بلا استثناء", () => {
    expect(parseMosqueRegistrationBody(null).ok).toBe(false);
    expect(parseMosqueRegistrationBody("x").ok).toBe(false);
    expect(parseMosqueRegistrationBody({ ...GOOD, mosqueName: 5, username: { a: 1 } }).ok).toBe(false);
  });
});

describe("parseRejectReason وloginStatusMessage", () => {
  it("سبب الرفض إلزامي ٣-٣٠٠ حرف", () => {
    expect(parseRejectReason({ reason: "  " }).ok).toBe(false);
    expect(parseRejectReason({ reason: "ab" }).ok).toBe(false);
    expect(parseRejectReason({ reason: "x".repeat(301) }).ok).toBe(false);
    expect(parseRejectReason({ reason: " بيانات ناقصة " })).toEqual({ ok: true, reason: "بيانات ناقصة" });
  });

  it("رسائل الدخول: معلّق ومرفوض بسبب أو بلا", () => {
    expect(loginStatusMessage("pending", null)).toBe("طلب تسجيل جامعك قيد المراجعة");
    expect(loginStatusMessage("rejected", "بيانات ناقصة")).toContain("بيانات ناقصة");
    expect(loginStatusMessage("rejected", null)).toBe("تم رفض طلب تسجيل جامعك");
  });
});
