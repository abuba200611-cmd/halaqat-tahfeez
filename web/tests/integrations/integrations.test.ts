import { describe, expect, it, vi } from "vitest";
import {
  bearerToken,
  generateApiKey,
  hashApiKey,
  parseApiKeyPrefix,
  parseScopes,
  verifyApiKeyHash,
} from "@/lib/api-keys";
import { buildCsv, csvCell } from "@/lib/csv";
import {
  UnsafeUrlError,
  assertSafeWebhookUrl,
  isPrivateIp,
  nextDelaySeconds,
  sendWebhook,
  signatureHeader,
  verifySignatureHeader,
} from "@/lib/webhooks";
import { authenticateV1, decodeCursor, encodeCursor, parseLimit, type V1Deps } from "@/lib/api-v1";
import { getFeature } from "@/lib/mosque/features";

vi.mock("@/lib/api-keys-db", () => ({ verifyApiKey: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({ isFeatureEnabled: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
  peekRateLimit: vi.fn(),
  recordRateLimitHit: vi.fn(),
}));

describe("مفاتيح API", () => {
  it("الصيغة mos_<prefix>_<random> والتجزئة SHA-256 ولا يخزَّن النص الصريح", () => {
    const k = generateApiKey();
    expect(k.plaintext).toMatch(/^mos_[0-9a-f]{8}_[0-9a-f]{64}$/);
    expect(parseApiKeyPrefix(k.plaintext)).toBe(k.prefix);
    expect(k.hash).toBe(hashApiKey(k.plaintext));
    expect(k.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(k.hash).not.toContain(k.plaintext);
    expect(generateApiKey().plaintext).not.toBe(k.plaintext);
  });
  it("التحقق: الصحيح يمرّ والمعدَّل أو المشوَّه يُرفض", () => {
    const k = generateApiKey();
    expect(verifyApiKeyHash(k.plaintext, k.hash)).toBe(true);
    expect(verifyApiKeyHash(k.plaintext.slice(0, -1) + (k.plaintext.endsWith("0") ? "1" : "0"), k.hash)).toBe(false);
    expect(verifyApiKeyHash("garbage", k.hash)).toBe(false);
    expect(verifyApiKeyHash(k.plaintext, "short")).toBe(false);
  });
  it("النطاقات والـBearer", () => {
    expect(parseScopes(["students:read", "students:read"])).toEqual(["students:read"]);
    expect(parseScopes([])).toBeNull();
    expect(parseScopes(["students:write"])).toBeNull();
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("توقيع الويب هوك", () => {
  it("يتحقق من توقيعه، ويرفض سراً/جسماً/طابعاً قديماً مختلفاً", () => {
    const body = '{"a":1}';
    const header = signatureHeader("whsec_x", body, 1000);
    expect(header).toMatch(/^t=1000,v1=[0-9a-f]{64}$/);
    expect(verifySignatureHeader("whsec_x", header, body, 1100)).toBe(true);
    expect(verifySignatureHeader("whsec_y", header, body, 1100)).toBe(false);
    expect(verifySignatureHeader("whsec_x", header, body + " ", 1100)).toBe(false);
    expect(verifySignatureHeader("whsec_x", header, body, 1000 + 301)).toBe(false);
    expect(verifySignatureHeader("whsec_x", null, body, 1000)).toBe(false);
  });
  it("التراجع الأُسّي ينتهي بعد ٦ محاولات", () => {
    expect(nextDelaySeconds(1)).toBe(60);
    expect(nextDelaySeconds(5)).toBe(21600);
    expect(nextDelaySeconds(6)).toBeNull();
  });
});

describe("حارس SSRF", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0",
    "100.64.0.1", "224.0.0.1", "::", "::1", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1",
    "::ffff:7f00:1", "::ffff:169.254.169.254", "64:ff9b::a00:1", "2002:7f00:1::1", "2001:db8::1", "ff02::1", "not-an-ip",
  ])("يرفض %s", (ip) => expect(isPrivateIp(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"])("يقبل %s", (ip) =>
    expect(isPrivateIp(ip)).toBe(false),
  );

  const pub = async () => [{ address: "93.184.216.34", family: 4 as const }];
  it("يرفض http والمنفذ والاعتماد وlocalhost وIP خاص حرفي", async () => {
    for (const u of [
      "http://example.com/x", "https://example.com:8443/x", "https://user:pw@example.com/",
      "https://localhost/x", "https://127.0.0.1/x", "https://[::1]/x", "https://169.254.169.254/latest",
      "ftp://example.com", "notaurl",
    ]) {
      await expect(assertSafeWebhookUrl(u, pub), u).rejects.toBeInstanceOf(UnsafeUrlError);
    }
  });
  it("يرفض نطاقاً يحلّ إلى خاص (حتى لو مع عنوان عام)", async () => {
    const mixed = async () => [
      { address: "93.184.216.34", family: 4 as const },
      { address: "10.0.0.5", family: 4 as const },
    ];
    await expect(assertSafeWebhookUrl("https://evil.example/x", mixed)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it("يقبل https عام ويعيد العنوان المُتحقَّق", async () => {
    const r = await assertSafeWebhookUrl("https://example.com/hook?x=1", pub);
    expect(r.address.address).toBe("93.184.216.34");
  });
  it("sendWebhook: لا يستدعي المُرسِل لوجهة خاصة، ويوقّع، ويعدّ 3xx فشلاً", async () => {
    const sender = vi.fn(async (_args: { headers: Record<string, string> }) => ({ status: 200 }));
    const bad = await sendWebhook(
      { url: "https://x.example/h", secret: "s", event: "ping", body: "{}", deliveryId: 1 },
      { resolve: async () => [{ address: "10.0.0.1", family: 4 }], sender },
    );
    expect(bad.ok).toBe(false);
    expect(sender).not.toHaveBeenCalled();

    const ok = await sendWebhook(
      { url: "https://x.example/h", secret: "s", event: "ping", body: "{}", deliveryId: 7 },
      { resolve: pub, sender, now: () => 1000 },
    );
    expect(ok.ok).toBe(true);
    expect(sender.mock.calls[0][0].headers["X-Salam-Signature"]).toBe(signatureHeader("s", "{}", 1000));

    const redirect = await sendWebhook(
      { url: "https://x.example/h", secret: "s", event: "ping", body: "{}", deliveryId: 1 },
      { resolve: pub, sender: async () => ({ status: 302 }) },
    );
    expect(redirect.ok).toBe(false);
  });
});

describe("CSV", () => {
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "\tx", "\rx"])("يعطّل الصيغة %j", (v) => {
    expect(csvCell(v).replace(/^"/, "").startsWith("'")).toBe(true);
  });
  it("تنصيص الفاصلة والسطر والتنصيص، والأرقام تبقى كما هي", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("a\nb")).toBe('"a\nb"');
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
    expect(csvCell("عادي")).toBe("عادي");
  });
  it("buildCsv بـBOM وCRLF", () => {
    const out = buildCsv(["أ", "ب"], [["=x", 1]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("\r\n'=x,1");
  });
});

describe("بوابة /api/v1", () => {
  const key = { id: 5, mosqueId: 9, scopes: ["students:read"] };
  function deps(over: Partial<V1Deps> = {}): V1Deps {
    return {
      verify: async (t) => (t === "good" ? key : null),
      featureEnabled: async () => true,
      keyRateOk: async () => true,
      failuresAllowed: async () => true,
      recordFailure: async () => undefined,
      ...over,
    };
  }
  const req = (auth?: string) =>
    new Request("http://x/api/v1/students", { headers: auth ? { authorization: auth } : {} });
  const status = async (r: Promise<unknown>) => ((await r) as Response).status;

  it("بلا مفتاح أو بمفتاح خاطئ: 401 ويُسجَّل الفشل", async () => {
    const recordFailure = vi.fn(async () => undefined);
    expect(await status(authenticateV1(req(), "students:read", deps({ recordFailure })))).toBe(401);
    expect(await status(authenticateV1(req("Bearer bad"), "students:read", deps({ recordFailure })))).toBe(401);
    expect(recordFailure).toHaveBeenCalledTimes(2);
  });
  it("نطاق ناقص: 403، والميزة مغلقة: 404، وحدّ المفتاح: 429", async () => {
    expect(await status(authenticateV1(req("Bearer good"), "progress:read", deps()))).toBe(403);
    expect(
      await status(authenticateV1(req("Bearer good"), "students:read", deps({ featureEnabled: async () => false }))),
    ).toBe(404);
    expect(
      await status(authenticateV1(req("Bearer good"), "students:read", deps({ keyRateOk: async () => false }))),
    ).toBe(429);
    expect(
      await status(authenticateV1(req("Bearer bad"), "students:read", deps({ failuresAllowed: async () => false }))),
    ).toBe(429);
  });
  it("النجاح يعيد جامع المفتاح وحده", async () => {
    expect(await authenticateV1(req("Bearer good"), "students:read", deps())).toEqual({ mosqueId: 9, keyId: 5 });
  });
  it("الترقيم: limit والمؤشر", () => {
    expect(parseLimit(null)).toBe(50);
    expect(parseLimit("200")).toBe(200);
    expect(parseLimit("201")).toBeNull();
    expect(parseLimit("0")).toBeNull();
    expect(parseLimit("abc")).toBeNull();
    expect(decodeCursor(encodeCursor([3, "s_1"]))).toEqual([3, "s_1"]);
    expect(decodeCursor("%%%")).toBe("invalid");
    expect(decodeCursor(Buffer.from('{"a":1}').toString("base64url"))).toBe("invalid");
    expect(decodeCursor(null)).toBeNull();
  });
});

describe("الميزة", () => {
  it("integrations جاهزة ومغلقة افتراضياً", () => {
    expect(getFeature("integrations")?.defaultEnabled).toBe(false);
    expect(getFeature("integrations")?.status).toBe("ready");
  });
});
