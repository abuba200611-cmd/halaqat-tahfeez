import { describe, expect, it, vi } from "vitest";
import { clearStaleSessions, type RoleSessionCheck } from "./stale-session";
import { staleSessionDestination } from "./landing";

function role(name: string, over: Partial<RoleSessionCheck> = {}) {
  const clear = vi.fn(async () => {});
  const check: RoleSessionCheck = { role: name, hasCookie: () => true, validHome: async () => null, clear, ...over };
  return { check, clear };
}

describe("clearStaleSessions — مسح الكوكيات الميتة فقط", () => {
  it("كوكي موجود وجلسته فاسدة → يُمسح ويُذكر", async () => {
    const teacher = role("teacher");
    const result = await clearStaleSessions([teacher.check]);
    expect(teacher.clear).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ cleared: ["teacher"], home: null });
  });

  it("بلا كوكي → لا فحص ولا مسح", async () => {
    const validHome = vi.fn(async () => null);
    const parent = role("parent", { hasCookie: () => false, validHome });
    expect(await clearStaleSessions([parent.check])).toEqual({ cleared: [], home: null });
    expect(validHome).not.toHaveBeenCalled();
    expect(parent.clear).not.toHaveBeenCalled();
  });

  it("جلسة دور آخر صالحة لا تُمسّ وتُرجَع صفحتها الرئيسية", async () => {
    const teacher = role("teacher");
    const mosque = role("mosque_admin", { validHome: async () => "/mosque/4" });
    const result = await clearStaleSessions([teacher.check, mosque.check]);
    expect(teacher.clear).toHaveBeenCalled();
    expect(mosque.clear).not.toHaveBeenCalled();
    expect(result).toEqual({ cleared: ["teacher"], home: "/mosque/4" });
  });

  it("تعذّر الفحص (القاعدة معطّلة) → لا يُمسح شيء", async () => {
    const student = role("student", {
      validHome: async () => {
        throw new Error("db down");
      },
    });
    expect(await clearStaleSessions([student.check])).toEqual({ cleared: [], home: null });
    expect(student.clear).not.toHaveBeenCalled();
  });
});

describe("staleSessionDestination — وجهة بوابة المعلّم", () => {
  it("الافتراضي الواجهة /welcome (لا نموذج دخول عند الجذر)", () => {
    expect(staleSessionDestination(null, "")).toBe("/welcome");
    expect(staleSessionDestination(undefined, "?utm=x")).toBe("/welcome");
  });

  it("دور آخر صالح → صفحته؛ لكن لا يُعاد الجذر ولا مسار بروتوكولي نسبي", () => {
    expect(staleSessionDestination("/parent", "")).toBe("/parent");
    expect(staleSessionDestination("/", "")).toBe("/welcome");
    expect(staleSessionDestination("//evil.com", "")).toBe("/welcome");
  });

  it("روابط الدعوة القديمة تذهب لـ/signup بمعاملاتها", () => {
    expect(staleSessionDestination(null, "?join=abc")).toBe("/signup?join=abc");
    expect(staleSessionDestination(null, "?googleError=denied")).toBe("/signup?googleError=denied");
  });
});
