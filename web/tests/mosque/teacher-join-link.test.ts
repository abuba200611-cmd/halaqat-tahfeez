import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  رابط انضمام المعلّمين: مسار المدير teacher-join-link (جلب/تجديد برابط على
  أصل التطبيق نفسه)، وذرّية الانضمام المباشر (halaqahs.mosque_id) والتجديد
  بقاعدة وهمية بالذاكرة. مسار المعلّم نفسه مغطّى في
  app/api/teacher/join-mosque/route.test.ts.
*/

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(),
  findMosqueByTeacherJoinCode: vi.fn(),
  joinHalaqahToMosqueByCode: vi.fn(),
  getOrCreateTeacherJoinCode: vi.fn(),
  rotateTeacherJoinCode: vi.fn(),
  isFeatureEnabled: vi.fn(),
}));

import { GET as linkGet, POST as linkRotate } from "@/app/api/mosques/[id]/teacher-join-link/route";
import { canAccessMosque } from "@/lib/mosque/access";
import {
  getMosque,
  getOrCreateTeacherJoinCode,
  isFeatureEnabled,
  rotateTeacherJoinCode,
} from "@/lib/mosque/db";

const MOSQUE = { id: 5, name: "جامع النور", city: "مكة", createdAt: "" };

beforeEach(() => {
  vi.resetAllMocks();
});

describe("/api/mosques/[id]/teacher-join-link", () => {
  const ctx = { params: Promise.resolve({ id: "5" }) };

  beforeEach(() => {
    vi.mocked(canAccessMosque).mockResolvedValue(true);
    vi.mocked(isFeatureEnabled).mockResolvedValue(true);
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

  it("GET يرجع رابط join-mosque على أصل التطبيق نفسه (بلا متغيّر بيئة)", async () => {
    const res = await linkGet(new Request("https://platform.example/api/mosques/5/teacher-join-link"), ctx);
    expect(await res.json()).toEqual({
      code: "CODE123456",
      link: "https://platform.example/join-mosque?code=CODE123456",
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

describe("joinHalaqahToMosqueByCode / attachHalaqahToMosque (قاعدة وهمية)", () => {
  async function load(halaqahMosqueId: number | null, mosqueFound = true) {
    vi.resetModules();
    vi.doUnmock("@/lib/mosque/db");
    const updates: unknown[][] = [];
    vi.doMock("@netlify/database", () => ({
      getDatabase: () => ({
        sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          const text = strings.join("?");
          if (/WHERE teacher_join_code/.test(text)) {
            return mosqueFound ? [{ id: 5, name: "جامع النور", city: "مكة", created_at: "" }] : [];
          }
          if (/FROM mosque_features/.test(text)) return [];
          if (/^\s*UPDATE halaqahs SET mosque_id/.test(text)) {
            updates.push(values);
            // الشرط الذرّي: يلمس الصف فقط لو mosque_id فارغ
            return halaqahMosqueId === null ? [{ id: values[1] }] : [];
          }
          if (/SELECT mosque_id FROM halaqahs/.test(text)) {
            return [{ mosque_id: halaqahMosqueId }];
          }
          return [];
        },
      }),
    }));
    return { real: await import("@/lib/mosque/db"), updates };
  }

  it("حلقة بلا جامع: تُربط بـmosque_id مباشرة بشرط IS NULL", async () => {
    const { real, updates } = await load(null);
    expect(await real.joinHalaqahToMosqueByCode(42, "abc")).toEqual({ ok: true, alreadyJoined: false, mosqueName: "جامع النور" });
    expect(updates).toEqual([[5, 42]]);
  });

  it("حلقة بنفس الجامع: alreadyJoined", async () => {
    const { real } = await load(5);
    expect(await real.joinHalaqahToMosqueByCode(42, "abc")).toMatchObject({ ok: true, alreadyJoined: true });
  });

  it("حلقة بجامع آخر: conflict ولا تُنقل", async () => {
    const { real } = await load(77);
    expect(await real.joinHalaqahToMosqueByCode(42, "abc")).toEqual({ ok: false, reason: "conflict" });
  });

  it("رمز مجهول: invalid بلا أي تحديث", async () => {
    const { real, updates } = await load(null, false);
    expect(await real.joinHalaqahToMosqueByCode(42, "nope")).toEqual({ ok: false, reason: "invalid" });
    expect(updates).toEqual([]);
  });
});
