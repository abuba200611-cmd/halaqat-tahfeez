import { beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-secret-not-for-production";

const cookies = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => cookies }));

const imp = vi.hoisted(() => ({ guardImpersonation: vi.fn() }));
vi.mock("@/lib/dev-impersonation", () => imp);

/*
  مخزن في الذاكرة يحاكي password_resets/teachers بنفس دلالات SQL الحقيقية:
  bump = UPDATE ... RETURNING (ذرّي)، burn = DELETE ... RETURNING، replace = DELETE ثم INSERT.
*/
type Row = { id: number; teacherId: number; codeHash: string; expiresAt: Date; attempts: number };
type TeacherRec = { id: number; passwordHash: string; emailVerified: boolean; sessionVersion: number };

const state = vi.hoisted(() => ({
  rows: [] as Row[],
  nextId: 1,
  now: new Date("2026-11-12T10:00:00Z"),
  teachers: new Map<string, TeacherRec>(),
  mails: [] as { to: string; subject: string; html: string }[],
  rateAllowed: true,
  rateKeys: [] as string[],
}));

vi.mock("@/lib/db", () => ({
  sessionSecret: async () => "test-secret-not-for-production",
  teacherSessionVersion: async (id: number) => {
    for (const t of state.teachers.values()) if (t.id === id) return t.sessionVersion;
    return 0;
  },
  findTeacherByUsername: async (email: string) => {
    const t = state.teachers.get(email);
    return t ? { id: t.id, deactivatedAt: null } : null;
  },
  replaceResetCode: async (teacherId: number, codeHash: string, expiresAt: Date) => {
    state.rows = state.rows.filter((r) => r.teacherId !== teacherId);
    state.rows.push({ id: state.nextId++, teacherId, codeHash, expiresAt, attempts: 0 });
  },
  bumpResetCodeAttempt: async (teacherId: number, now: Date) => {
    const row = state.rows.find((r) => r.teacherId === teacherId && r.expiresAt > now);
    if (!row) return null;
    row.attempts += 1;
    return { id: row.id, codeHash: row.codeHash, attempts: row.attempts };
  },
  burnResetCode: async (id: number) => {
    const before = state.rows.length;
    state.rows = state.rows.filter((r) => r.id !== id);
    return state.rows.length < before;
  },
  setTeacherPasswordViaReset: async (teacherId: number, passwordHash: string) => {
    for (const t of state.teachers.values()) {
      if (t.id === teacherId) {
        t.passwordHash = passwordHash;
        t.emailVerified = true;
        t.sessionVersion += 1;
      }
    }
    state.rows = state.rows.filter((r) => r.teacherId !== teacherId);
  },
}));
vi.mock("@/lib/mail", () => ({
  sendMail: async (to: string, subject: string, html: string) => {
    state.mails.push({ to, subject, html });
    return true;
  },
}));
vi.mock("@/lib/rate-limit", () => {
  const counts = new Map<string, number>();
  return {
    checkRateLimit: async (key: string, limit: number) => {
      state.rateKeys.push(key);
      if (!state.rateAllowed) return false;
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n <= limit;
    },
    __reset: () => counts.clear(),
  };
});

const { generateCode, hashResetCode, requestResetCode, confirmResetCode, CODE_TTL_MS, MAX_ATTEMPTS, SEND_OK_MESSAGE } =
  await import("./reset-code");
const { realResetDeps } = await import("./reset-code-deps");
const { hasUsablePassword, verifyPassword, hashPassword } = await import("./auth");
const { RESET_CODE_SUBJECT } = await import("./reset-code-mail");
const rateModule = (await import("@/lib/rate-limit")) as unknown as { __reset: () => void };
const { POST: confirmPOST } = await import("@/app/api/auth/reset-code/route");
const { POST: sendPOST } = await import("@/app/api/auth/forgot-password/route");

const deps = { ...realResetDeps, now: () => state.now };

/** الرمز الخام من آخر بريد مُرسل (٦ أرقام متباعدة بمسافات) */
function lastCode(): string {
  const html = state.mails[state.mails.length - 1].html;
  const match = html.match(/>((?:\d ){5}\d)</);
  return (match as RegExpMatchArray)[1].replace(/ /g, "");
}

function wrong(code: string): string {
  return code === "000000" ? "111111" : "000000";
}

beforeEach(() => {
  state.rows = [];
  state.nextId = 1;
  state.now = new Date("2026-11-12T10:00:00Z");
  state.teachers = new Map([
    ["a@x.com", { id: 1, passwordHash: hashPassword("old-password-1"), emailVerified: false, sessionVersion: 3 }],
    ["g@x.com", { id: 2, passwordHash: "f".repeat(64), emailVerified: true, sessionVersion: 0 }],
  ]);
  state.mails = [];
  state.rateAllowed = true;
  state.rateKeys = [];
  rateModule.__reset();
  cookies.set.mockClear();
  imp.guardImpersonation.mockResolvedValue(null);
});

describe("توليد الرمز وتجزئته", () => {
  it("٦ أرقام دائماً (يحفظ الأصفار البادئة)", () => {
    for (let i = 0; i < 300; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it("HMAC مملّح بالسرّ ومربوط بالمعلّم، ولا يحوي الرمز نفسه", () => {
    const h = hashResetCode("123456", 1, SECRET);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("123456");
    expect(hashResetCode("123456", 1, SECRET)).toBe(h);
    expect(hashResetCode("123456", 2, SECRET)).not.toBe(h);
    expect(hashResetCode("123456", 1, "other-secret")).not.toBe(h);
  });

  it("يُخزَّن الهاش فقط، والبريد يحمل الرمز بلا أي رابط", async () => {
    await requestResetCode("a@x.com", "1.1.1.1", deps);
    const code = lastCode();
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0].codeHash).toBe(hashResetCode(code, 1, SECRET));
    expect(JSON.stringify(state.rows)).not.toContain(code);
    const mail = state.mails[0];
    expect(mail.subject).toBe(RESET_CODE_SUBJECT);
    expect(mail.html).toContain("صالح لمدة ١٠ دقائق");
    expect(mail.html).toContain("إذا ما طلبته تجاهل الرسالة");
    expect(mail.html).not.toMatch(/href=|https?:\/\//);
  });
});

describe("التحقق", () => {
  async function issue(email = "a@x.com"): Promise<string> {
    await requestResetCode(email, "1.1.1.1", deps);
    return lastCode();
  }
  const confirm = (code: string, over: Record<string, unknown> = {}) =>
    confirmResetCode({ email: "a@x.com", code, password: "new-password-2", confirm: "new-password-2", ...over }, "2.2.2.2", deps);

  it("الرمز الصحيح ينجح ويعيّن كلمة المرور الجديدة", async () => {
    const code = await issue();
    const res = await confirm(code);
    expect(res).toEqual({ ok: true, teacherId: 1 });
    const t = state.teachers.get("a@x.com") as TeacherRec;
    expect(verifyPassword("new-password-2", t.passwordHash)).toBe(true);
    expect(verifyPassword("old-password-1", t.passwordHash)).toBe(false);
    expect(t.emailVerified).toBe(true);
  });

  it("الانتهاء: بعد ١٠ دقائق يُرفض الرمز الصحيح", async () => {
    const code = await issue();
    state.now = new Date(state.now.getTime() + CODE_TTL_MS + 1000);
    expect((await confirm(code)).ok).toBe(false);
  });

  it("قبل الانتهاء بلحظة ما زال صالحاً", async () => {
    const code = await issue();
    state.now = new Date(state.now.getTime() + CODE_TTL_MS - 1000);
    expect((await confirm(code)).ok).toBe(true);
  });

  it("حدّ المحاولات: بعد ٥ خاطئة يُحرق الرمز ولو جاءت السادسة صحيحة", async () => {
    const code = await issue();
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect((await confirm(wrong(code))).ok).toBe(false);
    expect(state.rows).toHaveLength(0);
    expect((await confirm(code)).ok).toBe(false);
  });

  it("الصحيح ضمن الخمس محاولات ينجح (الخامسة تحديداً)", async () => {
    const code = await issue();
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await confirm(wrong(code));
    expect((await confirm(code)).ok).toBe(true);
  });

  it("لمرة واحدة: إعادة استخدام نفس الرمز بعد النجاح تُرفض", async () => {
    const code = await issue();
    expect((await confirm(code)).ok).toBe(true);
    expect((await confirm(code, { password: "another-pass-3", confirm: "another-pass-3" })).ok).toBe(false);
    const t = state.teachers.get("a@x.com") as TeacherRec;
    expect(verifyPassword("new-password-2", t.passwordHash)).toBe(true);
  });

  it("الطلب الجديد يُبطل الرمز السابق", async () => {
    const first = await issue();
    const second = await issue();
    expect(state.rows).toHaveLength(1);
    if (first !== second) expect((await confirm(first)).ok).toBe(false);
    expect((await confirm(second)).ok).toBe(true);
  });

  it("صيغة الرمز وطول كلمة المرور والتأكيد تُرفض قبل أي فحص للرمز", async () => {
    const code = await issue();
    expect((await confirm("12ab56")).ok).toBe(false);
    expect((await confirm(code, { password: "short", confirm: "short" })).ok).toBe(false);
    expect((await confirm(code, { confirm: "different-pass" })).ok).toBe(false);
    expect(state.rows[0].attempts).toBe(0);
    expect((await confirm(code)).ok).toBe(true);
  });

  it("بريد غير مسجّل: نفس رسالة الرمز الخاطئ", async () => {
    const code = await issue();
    const unknown = await confirm(code, { email: "nobody@x.com" });
    const bad = await confirm(wrong(code));
    expect(unknown).toMatchObject({ ok: false, status: 400 });
    expect((unknown as { error: string }).error).toBe((bad as { error: string }).error);
  });

  it("رمز معلّم لا يصلح لمعلّم آخر", async () => {
    const code = await issue();
    expect((await confirm(code, { email: "g@x.com" })).ok).toBe(false);
  });

  it("حساب جوجل فقط (بصمة بلا ':') يستطيع تعيين كلمة مرور", async () => {
    expect(hasUsablePassword((state.teachers.get("g@x.com") as TeacherRec).passwordHash)).toBe(false);
    const code = await issue("g@x.com");
    const res = await confirmResetCode(
      { email: "g@x.com", code, password: "google-user-pass", confirm: "google-user-pass" },
      "3.3.3.3",
      deps,
    );
    expect(res.ok).toBe(true);
    const t = state.teachers.get("g@x.com") as TeacherRec;
    expect(hasUsablePassword(t.passwordHash)).toBe(true);
    expect(verifyPassword("google-user-pass", t.passwordHash)).toBe(true);
  });
});

describe("الإرسال: لا كشف للحسابات وحدود المعدّل", () => {
  it("جواب موحّد حرفياً لبريد مسجّل وغير مسجّل، وبلا بريد للثاني", async () => {
    const known = await requestResetCode("a@x.com", "1.1.1.1", deps);
    const unknown = await requestResetCode("nobody@x.com", "1.1.1.1", deps);
    const empty = await requestResetCode("", "1.1.1.1", deps);
    expect(known).toEqual(unknown);
    expect(known).toEqual(empty);
    expect(known.body.message).toBe(SEND_OK_MESSAGE);
    expect(state.mails).toHaveLength(1);
  });

  it("المسار HTTP يرد 200 بنفس الجسم لمسجّل وغير مسجّل", async () => {
    const mk = (email: string) =>
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "5.5.5.5" },
        body: JSON.stringify({ email }),
      });
    const a = await sendPOST(mk("a@x.com"));
    const b = await sendPOST(mk("nobody@x.com"));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await a.json()).toEqual(await b.json());
  });

  it("٣ إرسالات لكل بريد كل ١٥ دقيقة: الرابعة بنفس الجواب لكن بلا بريد جديد", async () => {
    for (let i = 0; i < 3; i++) await requestResetCode("a@x.com", `9.9.9.${i}`, deps);
    expect(state.mails).toHaveLength(3);
    const fourth = await requestResetCode("a@x.com", "9.9.9.9", deps);
    expect(fourth.status).toBe(200);
    expect(fourth.body.message).toBe(SEND_OK_MESSAGE);
    expect(state.mails).toHaveLength(3);
  });

  it("الحدّ على البريد يُحتسب حتى لغير المسجّل (لا فرق قابل للرصد)", async () => {
    await requestResetCode("nobody@x.com", "1.1.1.1", deps);
    expect(state.rateKeys).toContain("reset-send-email:nobody@x.com");
    expect(state.rateKeys).toContain("reset-send-ip:1.1.1.1");
  });

  it("تجاوز حدّ الـIP: 429 بلا إرسال", async () => {
    state.rateAllowed = false;
    const res = await requestResetCode("a@x.com", "1.1.1.1", deps);
    expect(res.status).toBe(429);
    expect(state.mails).toHaveLength(0);
  });

  it("تجاوز حدّ التحقق لكل IP: 429 ولا يُحتسب على الرمز", async () => {
    await requestResetCode("a@x.com", "1.1.1.1", deps);
    state.rateAllowed = false;
    const res = await confirmResetCode(
      { email: "a@x.com", code: lastCode(), password: "new-password-2", confirm: "new-password-2" },
      "2.2.2.2",
      deps,
    );
    expect(res).toMatchObject({ ok: false, status: 429 });
    expect(state.rows[0].attempts).toBe(0);
  });
});

describe("POST /api/auth/reset-code", () => {
  async function issueCode() {
    await requestResetCode("a@x.com", "1.1.1.1", deps);
    return lastCode();
  }
  const mk = (body: unknown) =>
    new Request("http://localhost/api/auth/reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "7.7.7.7" },
      body: JSON.stringify(body),
    });

  it("النجاح: يعيّن كلمة المرور، يرفع نسخة الجلسة، ويضبط كوكي الدخول بالنسخة الجديدة", async () => {
    const code = await issueCode();
    const before = (state.teachers.get("a@x.com") as TeacherRec).sessionVersion;
    const res = await confirmPOST(mk({ email: "a@x.com", code, password: "new-password-2", confirm: "new-password-2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, redirect: "/" });

    const t = state.teachers.get("a@x.com") as TeacherRec;
    expect(t.sessionVersion).toBe(before + 1);
    expect(t.emailVerified).toBe(true);

    expect(cookies.set).toHaveBeenCalledTimes(1);
    const [name, token, opts] = cookies.set.mock.calls[0];
    expect(name).toBe("halaqa_session");
    // الحمولة: معرّف المعلّم.نسخة الجلسة.وقت.توقيع — النسخة هي الجديدة
    expect((token as string).split(".").slice(0, 2)).toEqual(["1", String(before + 1)]);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });

  it("الفشل: 400 بلا كوكي", async () => {
    await issueCode();
    const res = await confirmPOST(mk({ email: "a@x.com", code: "000000", password: "new-password-2", confirm: "new-password-2" }));
    expect(res.status).toBe(400);
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it("أثناء «عرض كـ» ممنوع", async () => {
    imp.guardImpersonation.mockResolvedValue(Response.json({ error: "x" }, { status: 403 }));
    const res = await confirmPOST(mk({ email: "a@x.com", code: "123456", password: "new-password-2" }));
    expect(res.status).toBe(403);
    expect(cookies.set).not.toHaveBeenCalled();
  });
});
