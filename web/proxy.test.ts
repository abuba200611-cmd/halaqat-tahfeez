import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
  dev split — جدول قرارات المعترض proxy.ts: (مستضيج × مسار) → سماح /
  404 (إعادة كتابة لمسار غير موجود) / تحويل /dev. القاعدة المكتوبة نفسها
  تُطبَّق خادمياً بlib/host-gate.ts — اختبار البوابة في app/api/dev/routes.test.ts.
*/

const { proxy } = await import("./proxy");
const { isDevConsoleHost } = await import("@/lib/hosts");

const PUBLIC_HOST = "mos.vercel.app";
const DEV_HOST = "mos-dev-console.vercel.app";

function req(path: string, host: string, cookies: Record<string, string> = {}): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(`https://${host}${path}`, {
    headers: {
      host,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
    },
  });
}

type Decision = "allow" | "404" | "redirect-dev";

async function decide(path: string, host: string, cookies: Record<string, string> = {}): Promise<Decision> {
  const res = proxy(req(path, host, cookies));
  const rewrite = res.headers.get("x-middleware-rewrite");
  if (rewrite) {
    expect(rewrite).toContain("/--console-not-found");
    return "404";
  }
  if (res.headers.get("location")) {
    expect(res.headers.get("location")).toBe(`https://${host}/dev`);
    return "redirect-dev";
  }
  return "allow";
}

beforeEach(() => {
  delete process.env.DEV_CONSOLE_HOSTS;
});

afterEach(() => {
  delete process.env.DEV_CONSOLE_HOSTS;
});

describe("جدول قرارات المعترض: مستضيج × مسار", () => {
  const cases: { host: string; path: string; expected: Decision }[] = [
    // مستضيج عام: كل مسارات اللوحة 404، والمنصة نفسها تعمل بلا تحويل
    { host: PUBLIC_HOST, path: "/dev", expected: "404" },
    { host: PUBLIC_HOST, path: "/dev/users", expected: "404" },
    { host: PUBLIC_HOST, path: "/admin", expected: "404" },
    { host: PUBLIC_HOST, path: "/api/dev/users", expected: "404" },
    { host: PUBLIC_HOST, path: "/api/admin/suggestions", expected: "404" },
    { host: PUBLIC_HOST, path: "/api/admin/login", expected: "404" },
    { host: PUBLIC_HOST, path: "/", expected: "allow" },
    { host: PUBLIC_HOST, path: "/student", expected: "allow" },
    { host: PUBLIC_HOST, path: "/mosque/3", expected: "allow" },
    { host: PUBLIC_HOST, path: "/api/identity/me", expected: "allow" },
    { host: PUBLIC_HOST, path: "/devtools", expected: "allow" }, // بادئة /dev فقط لا تكفي
    // مستضيج اللوحة: "/" توجّه للوحة، وكل شيء آخر (مستضيج المطوّر ملكه) مسموح
    { host: DEV_HOST, path: "/", expected: "redirect-dev" },
    { host: DEV_HOST, path: "/dev", expected: "allow" },
    { host: DEV_HOST, path: "/dev/users", expected: "allow" },
    { host: DEV_HOST, path: "/admin", expected: "allow" },
    { host: DEV_HOST, path: "/api/dev/overview", expected: "allow" },
    { host: DEV_HOST, path: "/student", expected: "allow" },
    { host: DEV_HOST, path: "/mosque/3", expected: "allow" },
    { host: DEV_HOST, path: "/login", expected: "allow" },
  ];

  for (const { host, path, expected } of cases) {
    it(`${host} ${path} → ${expected}`, async () => {
      expect(await decide(path, host)).toBe(expected);
    });
  }

  it('مستضيج اللوحة + "/" أثناء «عرض كـ»: لا تحويل — الهبوط على صفحة الدور يعمل', async () => {
    expect(await decide("/", DEV_HOST, { dev_imp: "imp.teacher.1.1.0.0.0.sig" })).toBe("allow");
  });

  it("localhost بأي منفذ مستضيج لوحة خارج الإنتاج (بيئة الاختبار test)", async () => {
    expect(isDevConsoleHost("localhost:3000")).toBe(true);
    expect(isDevConsoleHost("127.0.0.1:5173")).toBe(true);
    expect(await decide("/dev/users", "localhost:3000")).toBe("allow");
    expect(await decide("/", "localhost:3000")).toBe("redirect-dev");
  });
});

describe("مستضيجو اللوحة من البيئة", () => {
  it("DEV_CONSOLE_HOSTS يضيف مستضيجين (نطاق معاينة مثلاً) بمنفذ أو بدونه", async () => {
    process.env.DEV_CONSOLE_HOSTS = "preview-abc.vercel.app, example.com:443 ";
    expect(isDevConsoleHost("preview-abc.vercel.app")).toBe(true);
    expect(isDevConsoleHost("example.com")).toBe(true);
    expect(await decide("/dev", "preview-abc.vercel.app")).toBe("allow");
    expect(await decide("/dev", "other.vercel.app")).toBe("404");
  });

  it("localhost ليس مستضيج لوحة في الإنتاج", () => {
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(isDevConsoleHost("localhost:3000")).toBe(false);
      expect(isDevConsoleHost(DEV_HOST)).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("مستضيج فارغ/مفقود ليس مستضيج لوحة", () => {
    expect(isDevConsoleHost(null)).toBe(false);
    expect(isDevConsoleHost("")).toBe(false);
  });
});
