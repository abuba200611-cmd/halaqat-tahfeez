import { beforeAll, describe, expect, it, vi } from "vitest";

// ملف الجلسة يستورد طبقة القاعدة والكوكيز — نحاكيها: هنا نختبر التوكن وحده
vi.mock("./association-db", () => ({ findAssociationAdminById: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const { createAssociationAdminSessionToken, readAssociationAdminSessionToken, ASSOCIATION_ADMIN_SESSION_COOKIE } =
  await import("./association-auth");
const { createMosqueAdminSessionToken, readMosqueAdminSessionToken, MOSQUE_ADMIN_SESSION_COOKIE } = await import("./mosque-auth");

describe("توكن جلسة مدير الجمعية", () => {
  it("ذهاب وإياب: المعرّف وإصدار الجلسة", async () => {
    const token = await createAssociationAdminSessionToken(7, 3);
    expect(await readAssociationAdminSessionToken(token)).toEqual({ adminId: 7, sessionVersion: 3 });
  });

  it("توقيع مُعبَّث به أو صيغة ناقصة مرفوضة", async () => {
    const token = await createAssociationAdminSessionToken(1, 0);
    expect(await readAssociationAdminSessionToken(token.slice(0, -4) + "0000")).toBeNull();
    expect(await readAssociationAdminSessionToken("association_admin.1.0.123")).toBeNull();
    expect(await readAssociationAdminSessionToken("")).toBeNull();
  });

  it("تغيير المعرّف أو الإصدار يُبطل التوقيع (لا تصعيد بتعديل الحمولة)", async () => {
    const token = await createAssociationAdminSessionToken(1, 0);
    const [tag, , version, issued, sig] = token.split(".");
    expect(await readAssociationAdminSessionToken([tag, "2", version, issued, sig].join("."))).toBeNull();
    expect(await readAssociationAdminSessionToken([tag, "1", "9", issued, sig].join("."))).toBeNull();
  });

  it("منتهي الصلاحية مرفوض", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const token = await createAssociationAdminSessionToken(1, 0);
      vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));
      expect(await readAssociationAdminSessionToken(token)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("الكوكي غير قابل للتبادل مع الأدوار الأخرى", () => {
  it("كوكيان بأسماء مختلفة", () => {
    expect(ASSOCIATION_ADMIN_SESSION_COOKIE).not.toBe(MOSQUE_ADMIN_SESSION_COOKIE);
  });

  it("توكن مدير جامع لا يُقبل كمدير جمعية", async () => {
    const mosqueToken = await createMosqueAdminSessionToken(1);
    expect(await readAssociationAdminSessionToken(mosqueToken)).toBeNull();
  });

  it("توكن مدير جمعية لا يُقبل كمدير جامع", async () => {
    const associationToken = await createAssociationAdminSessionToken(1, 0);
    expect(await readMosqueAdminSessionToken(associationToken)).toBeNull();
  });

  it("توكنات المعلّم والطالب والأدمن لا تُقبل كمدير جمعية", async () => {
    for (const foreign of [
      "1.0.1700000000000.deadbeef", // معلّم
      "student.1.YWJj.0.1700000000000.deadbeef", // طالب
      "admin.1700000000000.deadbeef", // أدمن
    ]) {
      expect(await readAssociationAdminSessionToken(foreign)).toBeNull();
    }
  });
});
