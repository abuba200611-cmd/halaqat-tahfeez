import { afterEach, describe, expect, it } from "vitest";
import { expectedAdminSecret, safeEqual } from "./safe-equal";

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

describe("expectedAdminSecret (إصلاح: مسافة/سطر جديد زائد بمتغيّر البيئة)", () => {
  const ORIGINAL = process.env.ADMIN_SECRET;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_SECRET;
    else process.env.ADMIN_SECRET = ORIGINAL;
  });

  it("يحذف سطراً جديداً زائداً بآخر القيمة — نفس السبب الفعلي الشائع عند اللصق بواجهة Vercel", () => {
    process.env.ADMIN_SECRET = "my-secret\n";
    expect(expectedAdminSecret()).toBe("my-secret");
    expect(safeEqual("my-secret", expectedAdminSecret())).toBe(true);
  });

  it("يحذف مسافات بادئة ولاحقة", () => {
    process.env.ADMIN_SECRET = "  my-secret  ";
    expect(expectedAdminSecret()).toBe("my-secret");
  });

  it("قبل الإصلاح كانت هذه الحالة بالضبط تفشل رغم صحة كلمة السر — نتحقق أن الإصلاح يعيدها true", () => {
    process.env.ADMIN_SECRET = "correct-horse-battery-staple\n";
    const userTyped = "correct-horse-battery-staple"; // بلا أي سطر جديد — هذا ما يكتبه المستخدم فعلياً
    // المقارنة الخام القديمة كانت تفشل لاختلاف الطول (سطر جديد زائد بالبيئة فقط)
    expect(safeEqual(userTyped, process.env.ADMIN_SECRET)).toBe(false);
    // بعد trim() على الطرفين (الإصلاح): تنجح
    expect(safeEqual(userTyped.trim(), expectedAdminSecret())).toBe(true);
  });

  it("قيمة غير موجودة بالبيئة: سلسلة فارغة", () => {
    delete process.env.ADMIN_SECRET;
    expect(expectedAdminSecret()).toBe("");
  });
});
