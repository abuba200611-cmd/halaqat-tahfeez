import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
  dev split — جدول قرارات المعترض proxy.ts: (مستضيج × مسار) → سماح /
  404 (إعادة كتابة لمسار غير موجود) / تحويل /dev. القاعدة المكتوبة نفسها
  تُطبَّق خادمياً بlib/host-gate.ts — اختبار البوابة في app/api/dev/routes.test.ts.

  وبوابة الترحيب: "/" بلا جلسة → إعادة كتابة لـ/welcome، ومسارات التسجيل
  بلا mos_intro → تحويل لـ/welcome?next=… (الأسماء والقواعد في lib/landing.ts).
*/

const { proxy } = await import("./proxy");
const { isDevConsoleHost } = await import("@/lib/hosts");
const { safeNextPath } = await import("@/lib/landing");

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

type Decision = "allow" | "404" | "redirect-dev" | "welcome" | "redirect-signup" | "gate-welcome";

async function decide(
  path: string,
  host: string,
  cookies: Record<string, string> = {},
): Promise<Decision> {
  const res = proxy(req(path, host, cookies));
  const rewrite = res.headers.get("x-middleware-rewrite");
  if (rewrite) {
    if (rewrite.includes("/welcome")) {
      expect(rewrite).toBe(`https://${host}/welcome`);
      return "welcome";
    }
    expect(rewrite).toContain("/--console-not-found");
    return "404";
  }
  const location = res.headers.get("location");
  if (location) {
    if (location === `https://${host}/dev`) return "redirect-dev";
    if (location.startsWith(`https://${host}/signup`)) return "redirect-signup";
    if (location.startsWith(`https://${host}/welcome?next=`)) return "gate-welcome";
    throw new Error(`تحويل غير متوقع: ${location}`);
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
    // "/" بلا كوكيات (جلسة ولا ترحيب) صارت الترحيب — بوابة L1
    { host: PUBLIC_HOST, path: "/", expected: "welcome" },
    { host: PUBLIC_HOST, path: "/student", expected: "allow" },
    { host: PUBLIC_HOST, path: "/mosque/3", expected: "allow" },
    { host: PUBLIC_HOST, path: "/api/identity/me", expected: "allow" },
    { host: PUBLIC_HOST, path: "/devtools", expected: "allow" }, // بادئة /dev فقط لا تكفي
    { host: PUBLIC_HOST, path: "/login", expected: "allow" }, // الدخول لا يُبوَّب بالترحيب
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

describe("PWA على مستضيف اللوحة: الأصول تمرّ ولا تُحجب", () => {
  const PWA_PATHS = [
    "/manifest.webmanifest",
    "/sw.js",
    "/sw-rules.js",
    "/offline",
    "/brand/icons/dev-192.png",
    "/brand/icons/dev-512-maskable.png",
    "/brand/logo.png",
    "/_next/static/chunks/app-abc123.js",
  ];
  for (const path of PWA_PATHS) {
    it(`${DEV_HOST} ${path} → allow (لا 404 ولا تحويل)`, async () => {
      expect(await decide(path, DEV_HOST)).toBe("allow");
    });
  }

  it("هذه المسارات خارج matcher أصلاً فلا يعترضها المعترض على أي مستضيف", async () => {
    const { config } = await import("./proxy");
    const patterns = config.matcher.map((m) => new RegExp(`^${m.replace(":path*", ".*")}$`));
    for (const path of PWA_PATHS) {
      expect(patterns.some((re) => re.test(path))).toBe(false);
    }
  });

  it("/dev و/api/dev ما زالت 404 على المستضيف العام وتعمل على مستضيف اللوحة", async () => {
    for (const path of ["/dev", "/dev/mosques", "/api/dev/overview"]) {
      expect(await decide(path, PUBLIC_HOST)).toBe("404");
      expect(await decide(path, DEV_HOST)).toBe("allow");
    }
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

/* ————— بوابة الترحيب (L1) ————— */

describe('"/" بلا جلسة → إعادة كتابة للترحيب، ومع الجلسة يبقى كما كان', () => {
  // كوكي واحد من أي دور يكفي — جدول الأدوار الخمسة
  const SESSIONS = [
    ["halaqa_session", "5.0.123.sig"],
    ["halaqa_student", "student.5.aWQ.0.123.sig"],
    ["halaqa_parent", "3.0.123.sig"],
    ["mosque_admin_session", "mosque_admin.7.123.sig"],
    ["association_admin_session", "association_admin.2.0.123.sig"],
  ] as const;

  for (const [name, value] of SESSIONS) {
    it(`"/" مع كوكي ${name} → لوحة الدور بلا إعادة كتابة`, async () => {
      expect(await decide("/", PUBLIC_HOST, { [name]: value })).toBe("allow");
    });
    // الإنتاج يكتب الجلسات ببادئة __Host- — كان proxy يتجاهلها فيرتد المسجَّل للترحيب
    it(`"/" مع كوكي __Host-${name} → لوحة الدور بلا إعادة كتابة`, async () => {
      expect(await decide("/", PUBLIC_HOST, { [`__Host-${name}`]: value })).toBe("allow");
    });
  }

  it('كوكي الترحيب وحده (mos_intro بلا جلسة) لا يمنع الترحيب على "/"', async () => {
    // المفتاح غياب الجلسة؛ mos_intro يخص بوابة مسارات التسجيل فقط
    expect(await decide("/", PUBLIC_HOST, { mos_intro: "1" })).toBe("welcome");
  });

  it('"/" بمعاملات قديمة (دعوة زميل /?join=) بلا جلسة → تحويل لـ/signup بمعاملاته', async () => {
    const res = proxy(req("/?join=abc123", PUBLIC_HOST));
    expect(res.headers.get("location")).toBe(`https://${PUBLIC_HOST}/signup?join=abc123`);
  });

  it('"/?googleError=…" بلا جلسة → /signup بالمعامل (لا يبتلعه الترحيب)', async () => {
    const res = proxy(req("/?googleError=denied", PUBLIC_HOST));
    expect(res.headers.get("location")).toBe(`https://${PUBLIC_HOST}/signup?googleError=denied`);
  });

  it('"/" بمعاملات ومع جلسة → يبقى على لوحته (الرابط الحالي يعرض الخطأ كما قبل)', async () => {
    expect(await decide("/?join=abc", PUBLIC_HOST, { halaqa_session: "5.0.1.sig" })).toBe("allow");
  });

  it("الإعادة الكتابة تحمل الرابط الظاهر \"/\" كما هو (لا تحويل)", async () => {
    const res = proxy(req("/", PUBLIC_HOST));
    expect(res.headers.get("x-middleware-rewrite")).toBe(`https://${PUBLIC_HOST}/welcome`);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("بوابة مسارات التسجيل: mos_intro", () => {
  const GATED = [
    "/signup",
    "/register-mosque",
    "/student-join",
    "/student-join?invite=abc",
    "/student-link",
    "/parent/join?token=t",
    "/j",
    "/j/3",
    "/j/3/schedule",
  ];

  for (const path of GATED) {
    it(`${path} بلا mos_intro → /welcome?next=${path}`, async () => {
      expect(await decide(path, PUBLIC_HOST)).toBe("gate-welcome");
      const res = proxy(req(path, PUBLIC_HOST));
      expect(res.headers.get("location")).toBe(
        `https://${PUBLIC_HOST}/welcome?next=${encodeURIComponent(path)}`,
      );
    });

    it(`${path} مع mos_intro → يمر`, async () => {
      expect(await decide(path, PUBLIC_HOST, { mos_intro: "1" })).toBe("allow");
    });
  }

  it("تسليم جوجل (google_handoff) بلا mos_intro يمر لـ/signup — لا يردّه الترحيب", async () => {
    expect(await decide("/signup?google=1", PUBLIC_HOST, { google_handoff: "tok.sig" })).toBe("allow");
  });

  it("/register-mosque يتبع بوابة الترحيب نفسها ويحمل next لعودة آمنة", async () => {
    const res = proxy(req("/register-mosque", PUBLIC_HOST));
    expect(res.headers.get("location")).toBe(`https://${PUBLIC_HOST}/welcome?next=%2Fregister-mosque`);
    expect(await decide("/register-mosque", PUBLIC_HOST, { halaqa_session: "5.0.1.sig" })).toBe("allow");
    // مستضيج اللوحة لا بوابة ترحيب فيه
    expect(await decide("/register-mosque", DEV_HOST)).toBe("allow");
  });

  it("من معه جلسة (مستخدم قائم) لا تُحجب عنه مسارات الانضمام", async () => {
    expect(await decide("/student-join", PUBLIC_HOST, { halaqa_session: "5.0.1.sig" })).toBe("allow");
    expect(await decide("/j/3", PUBLIC_HOST, { halaqa_parent: "3.0.1.sig" })).toBe("allow");
  });

  it("/join-mosque صفحة معلّم مسجَّل (AuthGate) وليست بوابة تسجيل", async () => {
    expect(await decide("/join-mosque?code=x", PUBLIC_HOST)).toBe("allow");
  });

  it('"/?utm_source=x" بلا جلسة → الترحيب (لا تحويل للتسجيل)', async () => {
    expect(await decide("/?utm_source=x", PUBLIC_HOST)).toBe("welcome");
  });

  it("الدخول واسترجاع كلمة المرور والتأكيد ليست مسارات تسجيل", async () => {
    expect(await decide("/login", PUBLIC_HOST)).toBe("allow");
    expect(await decide("/mosque-login", PUBLIC_HOST)).toBe("allow");
    expect(await decide("/association-login", PUBLIC_HOST)).toBe("allow");
    expect(await decide("/forgot-password", PUBLIC_HOST)).toBe("allow");
    expect(await decide("/reset-password?code=x", PUBLIC_HOST)).toBe("allow");
    expect(await decide("/verify/123", PUBLIC_HOST)).toBe("allow");
    expect(await decide("/api/register", PUBLIC_HOST)).toBe("allow");
  });

  it("مستضيج اللوحة لا يمر بالبوابة إطلاقاً — سلوكه كما كان", async () => {
    expect(await decide("/signup", DEV_HOST)).toBe("allow");
    expect(await decide("/student-join", DEV_HOST)).toBe("allow");
    expect(await decide("/j/3", "localhost:3000")).toBe("allow");
  });
});

describe("safeNextPath — مسار العودة في ?next=", () => {
  it("يقبل المسار النسبي فقط", () => {
    expect(safeNextPath("/signup")).toBe("/signup");
    expect(safeNextPath("/j/3?invite=abc")).toBe("/j/3?invite=abc");
    expect(safeNextPath("/parent/join?token=x")).toBe("/parent/join?token=x");
  });

  it("يرفض النسبي-بالبروتوكول والمطلق", () => {
    expect(safeNextPath("//evil.com")).toBeNull();
    expect(safeNextPath("/\\evil.com")).toBeNull();
    expect(safeNextPath("https://evil.com")).toBeNull();
    expect(safeNextPath("http://evil.com/x")).toBeNull();
    expect(safeNextPath("evil.com/x")).toBeNull();
  });

  it("يرفض الفارغ والمحارف الخبيثة", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath("/a\r\nb")).toBeNull();
    expect(safeNextPath("/a\tb")).toBeNull();
  });
});
