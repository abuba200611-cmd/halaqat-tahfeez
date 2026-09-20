import { describe, expect, it } from "vitest";
import { safeEqual } from "./safe-equal";

describe("safeEqual", () => {
  it("يرجع true لسلسلتين متطابقتين", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("يرجع false لسلسلتين مختلفتين بنفس الطول", () => {
    expect(safeEqual("abc123", "abc124")).toBe(false);
  });

  it("يرجع false بلا رمي لأطوال مختلفة", () => {
    expect(() => safeEqual("short", "a-much-longer-string")).not.toThrow();
    expect(safeEqual("short", "a-much-longer-string")).toBe(false);
  });

  it("يرجع true لسلسلتين فارغتين", () => {
    expect(safeEqual("", "")).toBe(true);
  });

  it("يرجع false لسلسلة فارغة مقابل غير فارغة", () => {
    expect(safeEqual("", "x")).toBe(false);
  });

  it("يقارن محارف UTF-8 غير ASCII بشكل صحيح", () => {
    expect(safeEqual("سرّ-عربي", "سرّ-عربي")).toBe(true);
    expect(safeEqual("سرّ-عربي", "سرّ-آخر")).toBe(false);
  });
});
