import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "./push-endpoint";

describe("isAllowedPushEndpoint — قائمة سماح مضيفي Web Push (منع SSRF)", () => {
  it("يقبل المضيفين المعروفين بالضبط", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc123")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/push/v1/xyz")).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/1/2abc")).toBe(true);
  });

  it("يقبل النطاقات الفرعية لمضيفي windows/apple فقط", () => {
    expect(isAllowedPushEndpoint("https://db5.notify.windows.com/w/?token=abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://abc.push.apple.com/1xyz")).toBe(true);
  });

  it("يرفض أي مضيف آخر — حتى الشبيهة بالأسماء المسموحة", () => {
    expect(isAllowedPushEndpoint("https://evil.example.com/push")).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com.evil.com/push")).toBe(false);
    expect(isAllowedPushEndpoint("https://evilfcm.googleapis.com/push")).toBe(false);
    expect(isAllowedPushEndpoint("https://notify.windows.com/token")).toBe(false); // ليس نطاقاً فرعياً
    expect(isAllowedPushEndpoint("https://attacker.com/#https://fcm.googleapis.com")).toBe(false);
  });

  it("يرفض ما ليس https صريحاً", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc")).toBe(false);
    expect(isAllowedPushEndpoint("fcm.googleapis.com/fcm/send/abc")).toBe(false);
  });

  it("يرفض المدخلات غير الصالحة أصلاً", () => {
    expect(isAllowedPushEndpoint("")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
    expect(isAllowedPushEndpoint("https://")).toBe(false);
  });
});
