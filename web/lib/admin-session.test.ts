import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAdminToken, verifyAdminToken } from "./admin-session";

const ORIGINAL_SECRET = process.env.ADMIN_SECRET;

describe("createAdminToken / verifyAdminToken — جلسة أدمن بتوكن موقّع لا بالسرّ الخام", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "s3cr3t";
  });

  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = ORIGINAL_SECRET;
  });

  it("توكن صادر الآن: يُقبل، ولا يساوي السرّ الخام أبداً", () => {
    const token = createAdminToken();
    expect(verifyAdminToken(token)).toBe(true);
    expect(token).not.toContain("s3cr3t");
  });

  it("توكن معدَّل: مرفوض", () => {
    const token = createAdminToken();
    expect(verifyAdminToken(`${token.slice(0, -1)}x`)).toBe(false);
  });

  it("السرّ الخام نفسه كتوكن: مرفوض", () => {
    expect(verifyAdminToken("s3cr3t")).toBe(false);
  });

  it("توكن موقَّع بسرّ مختلف (تغيّر ADMIN_SECRET): مرفوض", () => {
    const token = createAdminToken();
    process.env.ADMIN_SECRET = "different-secret";
    expect(verifyAdminToken(token)).toBe(false);
  });

  it("توكن بصيغة خاطئة أو فارغة: مرفوض", () => {
    expect(verifyAdminToken("")).toBe(false);
    expect(verifyAdminToken("admin")).toBe(false);
    expect(verifyAdminToken("admin.abc.sig")).toBe(false);
    expect(verifyAdminToken("teacher.123.sig")).toBe(false);
  });

  it("بلا ADMIN_SECRET مضبوط: التوليد والتحقق كلاهما بلا قيمة صالحة — التحقق false دائماً", () => {
    delete process.env.ADMIN_SECRET;
    expect(verifyAdminToken(createAdminToken())).toBe(false);
    expect(verifyAdminToken("admin.1760000000000.deadbeef")).toBe(false);
  });
});
