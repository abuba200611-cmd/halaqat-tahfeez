import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, afterEach, beforeAll, vi } from "vitest";
import manifest from "@/app/manifest";

/* مسار المانيفست يقرأ headers() — نحاكيها بمستضيف قابل للتبديل */
const hostState = vi.hoisted(() => ({ headers: {} as Record<string, string> }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (name: string) => hostState.headers[name.toLowerCase()] ?? null }),
}));
import { ANDROID_PACKAGE_NAME, DEV_INSTALL_MIN_VISITS, buildAssetLinks, devManifest, installBannerMode, isIosSafari, manifestForHost } from "@/lib/pwa";

const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0").toUpperCase()).join(":");

const loadSwRules = () => {
  const src = readFileSync(fileURLToPath(new URL("../public/sw-rules.js", import.meta.url)), "utf8");
  const mod: { exports: Record<string, unknown> } = { exports: {} };
  new Function("module", src)(mod);
  return mod.exports as {
    STATIC_CACHE: string;
    OFFLINE_CACHE: string;
    isStaleCacheName: (n: string) => boolean;
    classifyRequest: (i: { url: string; method?: string; mode?: string; ownOrigin: string }) => "static" | "navigate" | "bypass";
    extractStaticUrls: (t: string) => string[];
  };
};

describe("manifest", () => {
  let m: Awaited<ReturnType<typeof manifest>>;
  beforeAll(async () => {
    hostState.headers = { host: "mos.vercel.app" };
    m = await manifest();
  });
  it("الحقول الأساسية", () => {
    expect(m.name).toBe("السلام — نظام تشغيل الجامع");
    expect(m.short_name).toBe("السلام");
    expect(m.lang).toBe("ar");
    expect(m.dir).toBe("rtl");
    expect(m.start_url).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.background_color).toBe("#000000");
    expect(m.theme_color).toBe("#000000");
  });
  it("أيقونات 192 و512 وmaskable", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });
  it("اختصارات دخول/رسائل/الحضور", () => {
    expect((m.shortcuts ?? []).map((s) => s.url)).toEqual(["/login", "/messages", "/attendance"]);
  });
});

describe("المانيفست حسب المستضيف", () => {
  const DEV_HOST = "mos-dev-console.vercel.app";

  it("مستضيف اللوحة → مانيفست المطوّر المنفصل", () => {
    const d = manifestForHost(DEV_HOST);
    expect(d).toEqual(devManifest());
    expect(d.name).toBe("لوحة المطوّر — MOS");
    expect(d.short_name).toBe("المطوّر");
    expect(d.id).toBe("/dev");
    expect(d.start_url).toBe("/dev");
    expect(d.scope).toBe("/");
    expect(d.display).toBe("standalone");
    expect(d.theme_color).toBe("#000000");
    expect(d.background_color).toBe("#000000");
    const icons = d.icons ?? [];
    expect(icons.every((i) => i.src.startsWith("/brand/icons/dev-"))).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    expect((d.shortcuts ?? []).map((s) => s.name)).toEqual(["الجوامع", "طلبات الجوامع", "البلاغات", "صادر واتساب"]);
    expect((d.shortcuts ?? []).every((s) => (s.url ?? "").startsWith("/dev"))).toBe(true);
  });
  it("المستضيف العام والمفقود → مانيفست «السلام»", () => {
    for (const host of ["mos.vercel.app", null, undefined, ""]) {
      const main = manifestForHost(host);
      expect(main.id).toBe("/");
      expect(main.short_name).toBe("السلام");
      expect(main.start_url).toBe("/");
    }
  });
  it("المسار app/manifest يختار بحسب host وx-forwarded-host", async () => {
    hostState.headers = { host: DEV_HOST };
    expect((await manifest()).id).toBe("/dev");
    hostState.headers = { host: "mos.vercel.app", "x-forwarded-host": DEV_HOST };
    expect((await manifest()).id).toBe("/dev");
    hostState.headers = { host: "mos.vercel.app" };
    expect((await manifest()).id).toBe("/");
  });
  it("لافتة لوحة المطوّر تظهر من أول زيارة بينما العامة تنتظر الثانية", () => {
    const base = { dismissed: false, standalone: false, hasPrompt: true, ua: "x" };
    expect(installBannerMode({ ...base, visits: 1 })).toBe("none");
    expect(installBannerMode({ ...base, visits: 1, minVisits: DEV_INSTALL_MIN_VISITS })).toBe("android");
  });
  it("الأيقونات المذكورة موجودة فعلاً على القرص", async () => {
    const { existsSync } = await import("node:fs");
    for (const i of devManifest().icons ?? []) {
      expect(existsSync(fileURLToPath(new URL(`../public${i.src}`, import.meta.url)))).toBe(true);
    }
  });
});

describe("buildAssetLinks", () => {
  it("بلا قيمة → null", () => {
    expect(buildAssetLinks(undefined)).toBeNull();
    expect(buildAssetLinks("")).toBeNull();
  });
  it("بصمة غير صالحة → null", () => {
    expect(buildAssetLinks("not-a-fingerprint")).toBeNull();
    expect(buildAssetLinks(`${FP},zz`)).toBeNull();
  });
  it("بصمة صالحة → JSON بالحزمة المبدئية", () => {
    const out = buildAssetLinks(FP.toLowerCase());
    expect(out).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: { namespace: "android_app", package_name: "sa.alsalam.mos", sha256_cert_fingerprints: [FP] },
      },
    ]);
    expect(ANDROID_PACKAGE_NAME).toBe("sa.alsalam.mos");
  });
});

describe("GET /.well-known/assetlinks.json", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("المتغير غير مضبوط → 404", async () => {
    vi.stubEnv("ANDROID_ASSETLINKS_SHA256", "");
    const { GET } = await import("@/app/.well-known/assetlinks.json/route");
    expect(GET().status).toBe(404);
  });
  it("المتغير مضبوط → JSON", async () => {
    vi.stubEnv("ANDROID_ASSETLINKS_SHA256", FP);
    const { GET } = await import("@/app/.well-known/assetlinks.json/route");
    const res = GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].target.package_name).toBe("sa.alsalam.mos");
    expect(body[0].target.sha256_cert_fingerprints).toEqual([FP]);
  });
});

describe("قواعد عامل الخدمة (public/sw-rules.js)", () => {
  const R = loadSwRules();
  const origin = "https://mos.example";
  const c = (path: string, extra: { method?: string; mode?: string } = {}) =>
    R.classifyRequest({ url: `${origin}${path}`, ownOrigin: origin, ...extra });

  it("الأصول الثابتة cache-first", () => {
    expect(c("/_next/static/chunks/app-abc123.js")).toBe("static");
    expect(c("/brand/logo.png")).toBe("static");
  });
  it("لا نلمس /api/* أبداً حتى لو كان تنقّلاً", () => {
    expect(c("/api/auth/me")).toBe("bypass");
    expect(c("/api/push/subscribe", { method: "POST" })).toBe("bypass");
    expect(c("/api/messages", { mode: "navigate" })).toBe("bypass");
  });
  it("لوحة المطوّر: /api/dev لا يُعترض أبداً وHTML /dev شبكة بلا تخزين", () => {
    expect(c("/api/dev/overview")).toBe("bypass");
    expect(c("/api/dev/mosque-requests?count=1", { mode: "navigate" })).toBe("bypass");
    expect(c("/dev/mosques", { mode: "navigate" })).toBe("navigate"); // sw.js لا يضع ردّ navigate في أي ذاكرة
    expect(c("/dev/mosques", { mode: "cors" })).toBe("bypass");
  });
  it("sw.js لا يخزّن ردود التنقّل ولا يستدعي cache.put إلا للأصول الثابتة", () => {
    const sw = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
    const navigateBlock = sw.slice(sw.indexOf("// navigate:"), sw.indexOf("إشعارات الدفع"));
    expect(navigateBlock).not.toContain(".put(");
  });
  it("التنقّلات شبكة أولاً؛ الطلبات الأخرى (RSC/fetch) لا تُعترض", () => {
    expect(c("/students", { mode: "navigate" })).toBe("navigate");
    expect(c("/students", { mode: "cors" })).toBe("bypass");
  });
  it("غير GET وغير نفس الأصل وملفات العامل نفسه → bypass", () => {
    expect(c("/_next/static/x.js", { method: "POST" })).toBe("bypass");
    expect(R.classifyRequest({ url: "https://cdn.other/_next/static/x.js", ownOrigin: origin })).toBe("bypass");
    expect(c("/sw.js")).toBe("bypass");
  });
  it("تنظيف الذاكرات القديمة دون المساس بالحالية أو الغريبة", () => {
    expect(R.isStaleCacheName("mos-static-v0")).toBe(true);
    expect(R.isStaleCacheName(R.STATIC_CACHE)).toBe(false);
    expect(R.isStaleCacheName(R.OFFLINE_CACHE)).toBe(false);
    expect(R.isStaleCacheName("other-app-cache")).toBe(false);
  });
  it("استخراج روابط الأصول من HTML/CSS", () => {
    const html = '<link href="/_next/static/css/a1.css"/><script src="/_next/static/chunks/b2.js"></script>';
    expect(R.extractStaticUrls(html)).toEqual(["/_next/static/css/a1.css", "/_next/static/chunks/b2.js"]);
  });
  it("sw.js يحمّل القواعد ويحتفظ بمعالجات الدفع", () => {
    const sw = readFileSync(fileURLToPath(new URL("../public/sw.js", import.meta.url)), "utf8");
    expect(sw).toContain('importScripts("/sw-rules.js")');
    expect(sw).toContain('addEventListener("push"');
    expect(sw).toContain('addEventListener("notificationclick"');
  });
});

describe("لافتة التثبيت", () => {
  const base = { visits: 2, dismissed: false, standalone: false, hasPrompt: false, ua: "" };
  const IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1";
  const IOS_CHROME = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120 Mobile/15E148 Safari/604.1";

  it("لا تظهر قبل الزيارة الثانية أو بعد الإغلاق أو داخل التطبيق", () => {
    expect(installBannerMode({ ...base, visits: 1, hasPrompt: true })).toBe("none");
    expect(installBannerMode({ ...base, dismissed: true, hasPrompt: true })).toBe("none");
    expect(installBannerMode({ ...base, standalone: true, hasPrompt: true })).toBe("none");
  });
  it("أندرويد عند توفّر beforeinstallprompt، وiOS سفاري بتعليمات", () => {
    expect(installBannerMode({ ...base, hasPrompt: true })).toBe("android");
    expect(installBannerMode({ ...base, ua: IOS })).toBe("ios");
    expect(isIosSafari(IOS_CHROME)).toBe(false);
    expect(installBannerMode({ ...base, ua: "Mozilla/5.0 (Windows NT 10.0) Firefox/120" })).toBe("none");
  });
});
