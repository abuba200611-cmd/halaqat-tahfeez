import { beforeEach, describe, expect, it, vi } from "vitest";
import { authorizeLinkDecision, type LinkRecord } from "./association-links";

/*
  تفويض ربط الجوامع بالجمعيات: القرار للطرف المقابل لمن أرسل فقط، بالهوية
  المشتقة من الجلسة. نختبر الدالة النقية ثم decideLink (الترانزاكشن) ثم مسار
  مدير الجامع (مدير جامع آخر = 404 موحّد ولا كتابة).
*/

const FROM_ASSOCIATION: LinkRecord = { id: 1, mosqueId: 10, associationId: 7, requestedBy: "association", status: "pending" };
const FROM_MOSQUE: LinkRecord = { id: 2, mosqueId: 10, associationId: 7, requestedBy: "mosque", status: "pending" };

describe("authorizeLinkDecision", () => {
  it("طلب الجمعية: يقرره مدير الجامع المستهدف فقط", () => {
    expect(authorizeLinkDecision(FROM_ASSOCIATION, { kind: "mosque_admin", mosqueId: 10 })).toEqual({ ok: true });
    expect(authorizeLinkDecision(FROM_ASSOCIATION, { kind: "mosque_admin", mosqueId: 11 })).toEqual({ ok: false, code: "forbidden" });
    // الجمعية المرسلة نفسها لا تقبل طلبها
    expect(authorizeLinkDecision(FROM_ASSOCIATION, { kind: "association_admin", associationId: 7 })).toEqual({
      ok: false,
      code: "forbidden",
    });
  });

  it("طلب الجامع: تقرره الجمعية المستهدفة فقط", () => {
    expect(authorizeLinkDecision(FROM_MOSQUE, { kind: "association_admin", associationId: 7 })).toEqual({ ok: true });
    expect(authorizeLinkDecision(FROM_MOSQUE, { kind: "association_admin", associationId: 8 })).toEqual({ ok: false, code: "forbidden" });
    expect(authorizeLinkDecision(FROM_MOSQUE, { kind: "mosque_admin", mosqueId: 10 })).toEqual({ ok: false, code: "forbidden" });
  });

  it("المبتوت فيه لا يُبتّ ثانية، لكن غير المخوَّل يرى forbidden لا already_decided", () => {
    const done = { ...FROM_ASSOCIATION, status: "approved" as const };
    expect(authorizeLinkDecision(done, { kind: "mosque_admin", mosqueId: 10 })).toEqual({ ok: false, code: "already_decided" });
    expect(authorizeLinkDecision(done, { kind: "mosque_admin", mosqueId: 99 })).toEqual({ ok: false, code: "forbidden" });
  });
});

const state = vi.hoisted(() => ({
  link: null as Record<string, unknown> | null,
  calls: [] as { text: string; params: unknown[] }[],
  released: 0,
}));

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({
    sql: async () => [],
    pool: {
      query: async () => ({ rows: [] }),
      connect: async () => ({
        query: async (text: string, params: unknown[] = []) => {
          state.calls.push({ text, params });
          if (text.includes("FROM mosque_association_links") && text.includes("FOR UPDATE")) {
            return { rows: state.link ? [state.link] : [] };
          }
          return { rows: [] };
        },
        release: () => {
          state.released += 1;
        },
      }),
    },
  }),
}));

const { decideLink } = await import("./association-links-db");

const row = (over: Record<string, unknown> = {}) => ({
  id: 1,
  mosque_id: 10,
  association_id: 7,
  requested_by: "association",
  status: "pending",
  ...over,
});
const texts = () => state.calls.map((c) => c.text);

beforeEach(() => {
  state.link = null;
  state.calls = [];
  state.released = 0;
});

describe("decideLink — القبول يربط فعلياً والتفويض يحكم", () => {
  it("مدير الجامع المستهدف يقبل: الحالة + mosques.association_id + تدقيق ثم COMMIT", async () => {
    state.link = row();
    expect(await decideLink(1, { kind: "mosque_admin", mosqueId: 10 }, true)).toEqual({ ok: true, status: "approved" });
    const link = state.calls.find((c) => c.text.includes("UPDATE mosques SET association_id"));
    expect(link?.params).toEqual([10, 7]);
    expect(texts()[0]).toBe("BEGIN");
    expect(texts()[texts().length - 1]).toBe("COMMIT");
    expect(state.released).toBe(1);
  });

  it("الاعتذار يحفظ القرار بلا ربط", async () => {
    state.link = row();
    expect(await decideLink(1, { kind: "mosque_admin", mosqueId: 10 }, false)).toEqual({ ok: true, status: "declined" });
    expect(texts().some((t) => t.includes("UPDATE mosques SET association_id"))).toBe(false);
  });

  it("مدير جامع آخر: forbidden بتراجع كامل، لا تحديث ولا ربط ولا تدقيق", async () => {
    state.link = row();
    expect(await decideLink(1, { kind: "mosque_admin", mosqueId: 11 }, true)).toEqual({ ok: false, code: "forbidden" });
    expect(texts()).toContain("ROLLBACK");
    expect(texts().some((t) => t.includes("UPDATE mosque_association_links"))).toBe(false);
    expect(texts().some((t) => t.includes("UPDATE mosques"))).toBe(false);
    expect(texts().some((t) => t.includes("dev_audit_log"))).toBe(false);
  });

  it("الجمعية المرسلة لا تقبل طلب نفسها", async () => {
    state.link = row();
    expect(await decideLink(1, { kind: "association_admin", associationId: 7 }, true)).toEqual({ ok: false, code: "forbidden" });
    expect(texts().some((t) => t.includes("UPDATE mosques"))).toBe(false);
  });

  it("طلب جامع جديد: الجمعية المستهدفة تقبل، وجمعية أخرى ترفض", async () => {
    state.link = row({ requested_by: "mosque" });
    expect(await decideLink(1, { kind: "association_admin", associationId: 8 }, true)).toEqual({ ok: false, code: "forbidden" });
    state.calls = [];
    expect(await decideLink(1, { kind: "association_admin", associationId: 7 }, true)).toEqual({ ok: true, status: "approved" });
  });

  it("idempotent: المبتوت فيه → already_decided بلا كتابة ثانية؛ وغير الموجود → not_found", async () => {
    state.link = row({ status: "approved" });
    expect(await decideLink(1, { kind: "mosque_admin", mosqueId: 10 }, true)).toEqual({ ok: false, code: "already_decided" });
    expect(texts().some((t) => t.includes("UPDATE mosques"))).toBe(false);
    state.link = null;
    expect(await decideLink(9, { kind: "mosque_admin", mosqueId: 10 }, true)).toEqual({ ok: false, code: "not_found" });
  });
});

describe("مسار مدير الجامع", () => {
  it("بلا جلسة 401؛ ومدير جامع آخر 404 موحّد؛ والمستهدف ينجح", async () => {
    vi.resetModules();
    const admin = { current: null as null | { id: number; mosqueId: number } };
    const decide = vi.fn();
    vi.doMock("@/lib/mosque-auth", () => ({ currentMosqueAdmin: async () => admin.current }));
    vi.doMock("@/lib/association-links-db", () => ({ decideLink: decide, listLinksForMosque: vi.fn(async () => []) }));
    vi.doMock("@/lib/dev-error-log", () => ({ logServerError: vi.fn() }));
    const { POST } = await import("@/app/api/mosque-admin/link-requests/[id]/route");
    const call = () =>
      POST(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ accept: true }) }), {
        params: Promise.resolve({ id: "1" }),
      });

    expect((await call()).status).toBe(401);

    admin.current = { id: 5, mosqueId: 11 };
    decide.mockResolvedValueOnce({ ok: false, code: "forbidden" });
    expect((await call()).status).toBe(404);
    // الفاعل مشتق من جلسة مدير الجامع 11 لا من جسم الطلب
    expect(decide).toHaveBeenLastCalledWith(1, { kind: "mosque_admin", mosqueId: 11 }, true);

    admin.current = { id: 4, mosqueId: 10 };
    decide.mockResolvedValueOnce({ ok: true, status: "approved" });
    expect((await call()).status).toBe(200);
  });
});
