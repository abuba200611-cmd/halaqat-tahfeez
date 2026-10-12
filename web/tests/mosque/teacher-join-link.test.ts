import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  رابط انضمام المعلّمين: مسارا /api/link/mosque-info و/api/link/join-mosque
  (محميان بـx-link-secret)، ومسار المدير teacher-join-link (جلب/تجديد).
  طبقة القاعدة وتطبيق المعلّم مُحاكاتان؛ اختبار التجديد في آخر الملف يستعمل
  قاعدة وهمية بالذاكرة ليثبت أن الرمز القديم يتوقف فعلاً.
*/

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/halaqat", () => ({ fetchHalaqahInfo: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(),
  isFeatureEnabled: vi.fn(),
  createHalaqah: vi.fn(),
  findHalaqahByInviteCodeAnyMosque: vi.fn(),
  findMosqueByTeacherJoinCode: vi.fn(),
  getOrCreateTeacherJoinCode: vi.fn(),
  rotateTeacherJoinCode: vi.fn(),
}));

import { GET as mosqueInfo } from "@/app/api/link/mosque-info/route";
import { POST as joinMosque } from "@/app/api/link/join-mosque/route";
import { GET as linkGet, POST as linkRotate } from "@/app/api/mosques/[id]/teacher-join-link/route";
import { safeEqual } from "@/lib/link-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { fetchHalaqahInfo } from "@/lib/mosque/halaqat";
import {
  createHalaqah,
  findHalaqahByInviteCodeAnyMosque,
  findMosqueByTeacherJoinCode,
  getMosque,
  getOrCreateTeacherJoinCode,
  isFeatureEnabled,
  rotateTeacherJoinCode,
} from "@/lib/mosque/db";

const SECRET = "s3cret-value";
const MOSQUE = { id: 5, name: "جامع النور", city: "جدة", createdAt: "" };

function infoReq(code: string, secret?: string) {
  return new Request(`http://localhost/api/link/mosque-info?code=${code}`, {
    headers: secret ? { "x-link-secret": secret } : {},
  });
}

function joinReq(body: unknown, secret?: string) {
  return new Request("http://localhost/api/link/join-mosque", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(secret ? { "x-link-secret": secret } : {}) },
    body: JSON.stringify(body),
  });
}

const validBody = { code: "abc", halaqahInviteCode: "inv1", halaqahName: "x", teacherName: "y" };

beforeEach(() => {
  vi.resetAllMocks();
  process.env.LINK_SECRET = SECRET;
  process.env.TEACHER_APP_URL = "https://teachers.example/";
  vi.mocked(findMosqueByTeacherJoinCode).mockResolvedValue(MOSQUE);
  vi.mocked(isFeatureEnabled).mockResolvedValue(true);
  vi.mocked(findHalaqahByInviteCodeAnyMosque).mockResolvedValue(null);
  vi.mocked(fetchHalaqahInfo).mockResolvedValue({ halaqahName: "حلقة الفجر", teacherName: "أحمد" });
  vi.mocked(createHalaqah).mockResolvedValue(11);
});

describe("safeEqual", () => {
  it("يطابق المتساويين فقط، ولا يرمي عند اختلاف الطول", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("GET /api/link/mosque-info", () => {
  it("بلا سرّ = 401، وسرّ خاطئ = 401، وسرّ غير مضبوط بالبيئة = 401", async () => {
    expect((await mosqueInfo(infoReq("abc"))).status).toBe(401);
    expect((await mosqueInfo(infoReq("abc", "wrong"))).status).toBe(401);
    delete process.env.LINK_SECRET;
    expect((await mosqueInfo(infoReq("abc", SECRET))).status).toBe(401);
    expect(findMosqueByTeacherJoinCode).not.toHaveBeenCalled();
  });

  it("رمز مجهول = 404", async () => {
    vi.mocked(findMosqueByTeacherJoinCode).mockResolvedValue(null);
    expect((await mosqueInfo(infoReq("nope", SECRET))).status).toBe(404);
  });

  it("رمز صحيح = اسم الجامع ومدينته", async () => {
    const res = await mosqueInfo(infoReq("abc", SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mosqueName: "جامع النور", city: "جدة" });
  });
});

describe("POST /api/link/join-mosque", () => {
  it("السرّ مطلوب: بلا سرّ أو بسرّ خاطئ = 401 بلا أي كتابة", async () => {
    expect((await joinMosque(joinReq(validBody))).status).toBe(401);
    expect((await joinMosque(joinReq(validBody, "wrong"))).status).toBe(401);
    expect(createHalaqah).not.toHaveBeenCalled();
  });

  it("رمز جامع مجهول = 404", async () => {
    vi.mocked(findMosqueByTeacherJoinCode).mockResolvedValue(null);
    expect((await joinMosque(joinReq(validBody, SECRET))).status).toBe(404);
    expect(createHalaqah).not.toHaveBeenCalled();
  });

  it("ميزة الحلقات معطّلة = 404", async () => {
    vi.mocked(isFeatureEnabled).mockResolvedValue(false);
    expect((await joinMosque(joinReq(validBody, SECRET))).status).toBe(404);
    expect(isFeatureEnabled).toHaveBeenCalledWith(5, "halaqat");
  });

  it("بيانات ناقصة = 400", async () => {
    expect((await joinMosque(joinReq({ code: "abc" }, SECRET))).status).toBe(400);
  });

  it("انضمام جديد: يدرج الحلقة بأسماء نظام المعلّم", async () => {
    const res = await joinMosque(joinReq(validBody, SECRET));
    expect(res.status).toBe(200);
    expect(createHalaqah).toHaveBeenCalledWith(5, "حلقة الفجر", "أحمد", "inv1");
    expect(await res.json()).toMatchObject({ ok: true, alreadyJoined: false });
  });

  it("إعادة الانضمام لنفس الجامع: 200 alreadyJoined بلا إدراج مكرر", async () => {
    vi.mocked(findHalaqahByInviteCodeAnyMosque).mockResolvedValue({ id: 9, mosqueId: 5 });
    const res = await joinMosque(joinReq(validBody, SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, alreadyJoined: true });
    expect(createHalaqah).not.toHaveBeenCalled();
  });

  it("حلقة مضافة لجامع آخر = 409 برسالة عربية", async () => {
    vi.mocked(findHalaqahByInviteCodeAnyMosque).mockResolvedValue({ id: 9, mosqueId: 77 });
    const res = await joinMosque(joinReq(validBody, SECRET));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/جامع آخر/);
    expect(createHalaqah).not.toHaveBeenCalled();
  });

  it("رمز دعوة حلقة غير صحيح عند نظام المعلّم = 400 بلا إدراج", async () => {
    vi.mocked(fetchHalaqahInfo).mockResolvedValue(null);
    expect((await joinMosque(joinReq(validBody, SECRET))).status).toBe(400);
    expect(createHalaqah).not.toHaveBeenCalled();
  });
});

describe("/api/mosques/[id]/teacher-join-link", () => {
  const ctx = { params: Promise.resolve({ id: "5" }) };

  beforeEach(() => {
    vi.mocked(canAccessMosque).mockResolvedValue(true);
    vi.mocked(getMosque).mockResolvedValue(MOSQUE);
    vi.mocked(getOrCreateTeacherJoinCode).mockResolvedValue("CODE123456");
    vi.mocked(rotateTeacherJoinCode).mockResolvedValue("NEWCODE789");
  });

  it("بلا صلاحية = 401", async () => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await linkGet(new Request("http://localhost"), ctx)).status).toBe(401);
    expect((await linkRotate(new Request("http://localhost", { method: "POST" }), ctx)).status).toBe(401);
    expect(rotateTeacherJoinCode).not.toHaveBeenCalled();
  });

  it("GET يرجع رابط join-mosque على عنوان تطبيق المعلّم", async () => {
    const res = await linkGet(new Request("http://localhost"), ctx);
    expect(await res.json()).toEqual({
      code: "CODE123456",
      link: "https://teachers.example/join-mosque?code=CODE123456",
    });
  });

  it("POST يجدّد الرمز ويرجع الرابط الجديد", async () => {
    const res = await linkRotate(new Request("http://localhost", { method: "POST" }), ctx);
    expect(rotateTeacherJoinCode).toHaveBeenCalledWith(5);
    expect(((await res.json()) as { link: string }).link).toContain("code=NEWCODE789");
  });
});

describe("تجديد الرمز يبطل القديم (قاعدة وهمية بالذاكرة)", () => {
  it("بعد rotate: الرمز القديم لا يُعثر به على الجامع والجديد يعثر", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/mosque/db");
    const state = { code: null as string | null };
    vi.doMock("@netlify/database", () => ({
      getDatabase: () => ({
        sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join("?");
          if (/^\s*SELECT teacher_join_code/.test(text)) return [{ teacher_join_code: state.code }];
          if (/^\s*UPDATE mosques SET teacher_join_code/.test(text)) {
            if (/IS NULL/.test(text) && state.code) return [];
            state.code = values[0] as string;
            return [{ id: 1 }];
          }
          if (/WHERE teacher_join_code/.test(text)) {
            return values[0] === state.code
              ? [{ id: 1, name: "م", city: "ج", created_at: "" }]
              : [];
          }
          return [];
        },
      }),
    }));
    const real = await import("@/lib/mosque/db");

    const first = await real.getOrCreateTeacherJoinCode(1);
    expect(first).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(await real.getOrCreateTeacherJoinCode(1)).toBe(first);
    expect(await real.findMosqueByTeacherJoinCode(first!)).not.toBeNull();

    const second = await real.rotateTeacherJoinCode(1);
    expect(second).not.toBe(first);
    expect(await real.findMosqueByTeacherJoinCode(first!)).toBeNull();
    expect(await real.findMosqueByTeacherJoinCode(second!)).not.toBeNull();
  });
});

describe("حذف عضو حر ينظّف روابطه (قاعدة وهمية)", () => {
  it("يحذف family_members وcommittee_members بنوع member مقيّدة بالجامع", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/mosque/db");
    const calls: { text: string; values: unknown[] }[] = [];
    vi.doMock("@netlify/database", () => ({
      getDatabase: () => ({
        sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join("?");
          calls.push({ text, values });
          return /DELETE FROM mosque_members/.test(text) ? [{ id: 9 }] : [];
        },
      }),
    }));
    const real = await import("@/lib/mosque/db");
    expect(await real.deleteMosqueMember(4, 9)).toBe(true);
    const fam = calls.find((c) => /DELETE FROM family_members/.test(c.text))!;
    const com = calls.find((c) => /DELETE FROM committee_members/.test(c.text))!;
    for (const c of [fam, com]) {
      expect(c.text).toMatch(/member_kind = 'member'/);
      expect(c.text).toMatch(/mosque_id = \?/);
      expect(c.values).toEqual([9, 4]);
    }
  });

  it("عضو غير موجود: لا حذف للروابط", async () => {
    vi.resetModules();
    vi.doUnmock("@/lib/mosque/db");
    const calls: string[] = [];
    vi.doMock("@netlify/database", () => ({
      getDatabase: () => ({ sql: async (s: TemplateStringsArray) => (calls.push(s.join("?")), []) }),
    }));
    const real = await import("@/lib/mosque/db");
    expect(await real.deleteMosqueMember(4, 9)).toBe(false);
    expect(calls).toHaveLength(1);
  });
});
