import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  التحقق العام من الشهادات: الرد يحمل أقل ما يلزم (النوع والجامع والاسم
  والإنجاز والتاريخ والصلاحية) — لا درجة ولا ملاحظات ولا هاتف ولا معرّف
  داخلي (mosqueId داخلي لحدّ المعدل ولا يُسرَّب بالرد).
*/

vi.mock("@/lib/client-ip", () => ({ clientIp: () => "203.0.113.9" }));

const rateLimit = vi.hoisted(() => ({ checkRateLimit: vi.fn(async () => true) }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: rateLimit.checkRateLimit,
  rateLimited: () => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 }),
}));

const examsDb = vi.hoisted(() => ({
  findCertificateForVerification: vi.fn(),
  getExamConfig: vi.fn(async () => ({} as never)),
}));
vi.mock("@/lib/mosque/exams-db", () => examsDb);

import { GET as verifyGet } from "@/app/api/verify/[code]/route";

const ctx = (code: string) => ({ params: Promise.resolve({ code }) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  examsDb.findCertificateForVerification.mockResolvedValue({
    valid: true,
    mosqueId: 3,
    mosqueName: "جامع النور",
    kind: "student_exam",
    holderName: "عبدالله محمد",
    title: "حفظ الجزء 30",
    issuedAt: "2026-10-17",
  });
});

describe("GET /api/verify/[code]", () => {
  it("يعرض الاسم والإنجاز والتاريخ والجامع والصلاحية فقط — لا بيانات خاصة", async () => {
    const response = await verifyGet(new Request("http://x"), ctx("MOS-abc123"));
    expect(response.status).toBe(200);

    const body = (await response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["holderName", "issuedAt", "kind", "kindLabel", "mosqueName", "title", "valid"].sort(),
    );
    expect(body.holderName).toBe("عبدالله محمد");
    expect(body.title).toBe("حفظ الجزء 30");
    expect(body.issuedAt).toBe("2026-10-17");
    expect(body.kindLabel).toBe("شهادة إنجاز");

    // لا درجة ولا ملاحظات ولا هواتف ولا معرّفات داخلية
    const serialized = JSON.stringify(body);
    for (const forbidden of ["score", "notes", "phone", "studentId", "mosqueId", "examiner", "errors"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("الشهادة المسحوبة تظهر غير صالحة ولا تكشف سبب سحبها", async () => {
    examsDb.findCertificateForVerification.mockResolvedValue({
      valid: false,
      mosqueId: 3,
      mosqueName: "جامع النور",
      kind: "teacher_service",
      holderName: "معلم قديم",
      title: "شهادة خدمة",
      issuedAt: "2025-01-01",
    });
    const body = (await (await verifyGet(new Request("http://x"), ctx("MOS-old1"))).json()) as { valid: boolean };
    expect(body.valid).toBe(false);
  });

  it("رمز مجهول أو بصيغة تالفة = 404 موحّد", async () => {
    examsDb.findCertificateForVerification.mockResolvedValue(null);
    expect((await verifyGet(new Request("http://x"), ctx("MOS-nope"))).status).toBe(404);
    expect((await verifyGet(new Request("http://x"), ctx("bad code!"))).status).toBe(404);
    expect(examsDb.findCertificateForVerification).toHaveBeenCalledTimes(1); // الصيغة التالفة لا تصل القاعدة
  });

  it("تجاوز حدّ المعدل = 429", async () => {
    rateLimit.checkRateLimit.mockResolvedValue(false);
    expect((await verifyGet(new Request("http://x"), ctx("MOS-abc123"))).status).toBe(429);
  });
});
