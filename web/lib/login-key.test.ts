import { describe, expect, it } from "vitest";
import { loginFailureKey } from "./login-key";

describe("loginFailureKey — عدّاد الفشل لكل (IP + معرّف)", () => {
  it("يختلف باختلاف الـIP لنفس المعرّف: غريب لا يقفل الضحية عن عنوانه", () => {
    expect(loginFailureKey("login:email", "1.1.1.1", "a@b.com")).not.toBe(loginFailureKey("login:email", "2.2.2.2", "a@b.com"));
  });
  it("يختلف باختلاف المعرّف والنطاق، ويثبت لنفس الثلاثية", () => {
    expect(loginFailureKey("s", "1.1.1.1", "a")).not.toBe(loginFailureKey("s", "1.1.1.1", "b"));
    expect(loginFailureKey("s1", "1.1.1.1", "a")).not.toBe(loginFailureKey("s2", "1.1.1.1", "a"));
    expect(loginFailureKey("s", "1.1.1.1", "a")).toBe(loginFailureKey("s", "1.1.1.1", "a"));
  });
  it("يقصّ المعرّفات الطويلة", () => {
    expect(loginFailureKey("s", "ip", "x".repeat(1000)).length).toBeLessThan(220);
  });
});
