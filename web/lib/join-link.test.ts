import { describe, expect, it } from "vitest";
import { parseMosqueJoinInput } from "./join-link";

describe("parseMosqueJoinInput", () => {
  it("الرابط الكامل بصيغة رابط مدير الجامع", () => {
    expect(parseMosqueJoinInput("https://halaqa.example.com/join-mosque?code=Ab3dE9_xYz")).toBe("Ab3dE9_xYz");
  });

  it("رابط بمعاملات إضافية ومسافات حول الرابط", () => {
    expect(
      parseMosqueJoinInput("  https://x.app/join-mosque?utm_source=wa&code=Ab-3dE9&ref=1#top \n"),
    ).toBe("Ab-3dE9");
  });

  it("معامل join= ومقطع /j/<code>", () => {
    expect(parseMosqueJoinInput("https://x.app/anything?join=QWERTY12")).toBe("QWERTY12");
    expect(parseMosqueJoinInput("https://x.app/j/QWERTY12")).toBe("QWERTY12");
    expect(parseMosqueJoinInput("https://x.app/j/QWERTY12/schedule")).toBe("QWERTY12");
  });

  it("رابط بلا بروتوكول", () => {
    expect(parseMosqueJoinInput("halaqa.example.com/join-mosque?code=Zx81Qp0")).toBe("Zx81Qp0");
  });

  it("الرمز وحده (مع مسافات طرفية)", () => {
    expect(parseMosqueJoinInput("Ab3dE9_xYz")).toBe("Ab3dE9_xYz");
    expect(parseMosqueJoinInput("  Ab3dE9_xYz  ")).toBe("Ab3dE9_xYz");
  });

  it("مدخل غير مفهوم = null", () => {
    expect(parseMosqueJoinInput("")).toBeNull();
    expect(parseMosqueJoinInput("   ")).toBeNull();
    expect(parseMosqueJoinInput("مرحبا بك")).toBeNull();
    expect(parseMosqueJoinInput("hello world")).toBeNull();
    expect(parseMosqueJoinInput("https://example.com/about")).toBeNull();
    expect(parseMosqueJoinInput("https://x.app/join-mosque?code=")).toBeNull();
    expect(parseMosqueJoinInput("javascript:alert(1)")).toBeNull();
    expect(parseMosqueJoinInput("ab")).toBeNull();
    expect(parseMosqueJoinInput("<script>alert(1)</script>")).toBeNull();
  });
});
