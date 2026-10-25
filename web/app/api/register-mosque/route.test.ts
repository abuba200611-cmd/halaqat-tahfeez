import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(),
  createRegistrationRequest: vi.fn(),
  hashPassword: vi.fn((p: string) => `hash:${p}`),
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimited: () => Response.json({ error: "محاولات كثيرة، حاول لاحقاً" }, { status: 429 }),
}));
vi.mock("@/lib/mosque-registration-db", () => ({ createRegistrationRequest: mocks.createRegistrationRequest }));
vi.mock("@/lib/mosque/password", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("@/lib/dev-error-log", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/privacy-consent", () => ({ recordPrivacyConsent: vi.fn(async () => undefined) }));

const { POST, REGISTER_MOSQUE_MAX_PER_HOUR } = await import("./route");

const GOOD = {
  mosqueName: "جامع النور",
  city: "",
  applicantName: "أحمد",
  phone: "0501234567",
  email: "a@b.co",
  username: "noor",
  password: "secret123",
  confirmPassword: "secret123",
  associationName: "",
  privacyConsent: true,
};

const post = (body: unknown, ip = "1.2.3.4") =>
  POST(
    new Request("http://localhost/api/register-mosque", {
      method: "POST",
      headers: { "x-forwarded-for": ip, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockResolvedValue(true);
  mocks.createRegistrationRequest.mockResolvedValue({ ok: true, id: 1 });
});

describe("POST /api/register-mosque", () => {
  it("بلا موافقة على سياسة الخصوصية → 400 ولا تخزين", async () => {
    const res = await post({ ...GOOD, privacyConsent: false });
    expect(res.status).toBe(400);
    expect(mocks.createRegistrationRequest).not.toHaveBeenCalled();
  });

  it("طلب سليم → 200، تُجزَّأ كلمة المرور ولا تصل خاماً للتخزين", async () => {
    const res = await post(GOOD);
    expect(res.status).toBe(200);
    expect(mocks.hashPassword).toHaveBeenCalledWith("secret123");
    const [input, hash] = mocks.createRegistrationRequest.mock.calls[0];
    expect(hash).toBe("hash:secret123");
    expect(input.username).toBe("noor");
  });

  it("الحدّ لكل IP: المفتاح يحمل العنوان والحدّ المعلن، وتجاوزه 429 بلا لمس القاعدة", async () => {
    mocks.checkRateLimit.mockResolvedValue(false);
    const res = await post(GOOD, "9.9.9.9");
    expect(res.status).toBe(429);
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("register-mosque:9.9.9.9", REGISTER_MOSQUE_MAX_PER_HOUR, 3600);
    expect(mocks.createRegistrationRequest).not.toHaveBeenCalled();
  });

  it("الحدّ يُحتسب قبل التحقق (الطلبات الفاسدة تستهلك الحصة أيضاً)", async () => {
    await post({ ...GOOD, email: "bad" });
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
  });

  it("تحقق خادمي: حقل غير صالح → 400 باسم الحقل ولا تجزئة ولا تخزين", async () => {
    const res = await post({ ...GOOD, phone: "12" });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe("phone");
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.createRegistrationRequest).not.toHaveBeenCalled();
  });

  it("تأكيد كلمة المرور المختلف → 400", async () => {
    const res = await post({ ...GOOD, confirmPassword: "other12345" });
    expect(res.status).toBe(400);
    expect(mocks.createRegistrationRequest).not.toHaveBeenCalled();
  });

  it("اسم مستخدم مكرر → 409 بحقل username", async () => {
    mocks.createRegistrationRequest.mockResolvedValue({ ok: false, code: "username_taken" });
    const res = await post(GOOD);
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe("username");
  });

  it("جسم JSON فاسد → 400 لا استثناء", async () => {
    const res = await POST(new Request("http://localhost/api/register-mosque", { method: "POST", body: "{bad" }));
    expect(res.status).toBe(400);
  });
});
