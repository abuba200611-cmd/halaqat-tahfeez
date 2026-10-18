import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B2 — مسارات المراسلة: 401 بلا جلسة، 404 لميزة معطّلة أو لمحادثة ليس
  المستخدم طرفاً فيها، 400 لنص غير صالح، 429 لتجاوز الحد، والإشعار داخل
  after() لا يكسر الإرسال أبداً.
*/

const m = vi.hoisted(() => ({
  actor: null as unknown,
  gate: 1 as number | null,
  send: { ok: false, reason: "not-participant" } as unknown,
  open: null as unknown,
  notify: vi.fn(async () => {
    throw new Error("push down");
  }),
}));
const afterCbs = vi.hoisted(() => [] as (() => Promise<void>)[]);

vi.mock("next/server", () => ({ after: (cb: () => Promise<void>) => afterCbs.push(cb) }));
vi.mock("@/lib/messaging-notify", () => ({ notifyMessageRecipients: m.notify }));
vi.mock("@/lib/messaging", () => ({
  sanitizeMessageBody: (v: unknown) => (typeof v === "string" && v.trim() && v.trim().length <= 2000 ? v.trim() : null),
  resolveMessagingActor: async () => m.actor,
  actorFeatureGate: async () => m.gate,
  sendMessage: async () => m.send,
  openConversationFor: async () => m.open,
  listMessages: async () => ({ messages: [], nextBefore: null }),
  markConversationRead: async () => true,
  totalUnreadFor: async () => 4,
  listConversationsFor: async () => [],
  contactOptionsFor: async () => [],
  startConversation: async () => ({ ok: false, reason: "not-allowed" }),
}));

const send = await import("./send/route");
const thread = await import("./[id]/route");
const summary = await import("./route");
const start = await import("./start/route");

const post = (body: unknown) =>
  new Request("http://x/api/messages/send?role=teacher", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  m.actor = { role: "teacher", participantId: "5", displayName: "م" };
  m.gate = 1;
  m.send = { ok: false, reason: "not-participant" };
  m.open = null;
  afterCbs.length = 0;
});

describe("مسارات المراسلة", () => {
  it("بلا جلسة = 401 في كل المسارات", async () => {
    m.actor = null;
    expect((await send.POST(post({ conversationId: 1, body: "a" }))).status).toBe(401);
    expect((await summary.GET(new Request("http://x/api/messages"))).status).toBe(401);
    expect((await start.POST(post({}))).status).toBe(401);
    const res = await thread.GET(new Request("http://x/api/messages/1"), { params: Promise.resolve({ id: "1" }) });
    expect(res.status).toBe(401);
  });

  it("الميزة معطّلة = 404", async () => {
    m.gate = -1 as unknown as number;
    expect((await send.POST(post({ conversationId: 1, body: "a" }))).status).toBe(404);
    expect((await summary.GET(new Request("http://x/api/messages?summary=1"))).status).toBe(404);
  });

  it("غير الطرف: قراءة المحادثة 404، والإرسال 404، ومعرّف غير رقمي 404", async () => {
    const res = await thread.GET(new Request("http://x/api/messages/7"), { params: Promise.resolve({ id: "7" }) });
    expect(res.status).toBe(404);
    expect((await send.POST(post({ conversationId: 7, body: "a" }))).status).toBe(404);
    const bad = await thread.GET(new Request("http://x/api/messages/abc"), { params: Promise.resolve({ id: "abc" }) });
    expect(bad.status).toBe(404);
  });

  it("التحقق: فارغ أو طويل أو بلا معرّف أو JSON تالف = 400", async () => {
    expect((await send.POST(post({ conversationId: 1, body: "   " }))).status).toBe(400);
    expect((await send.POST(post({ conversationId: 1, body: "ا".repeat(2001) }))).status).toBe(400);
    expect((await send.POST(post({ body: "a" }))).status).toBe(400);
    expect((await send.POST(new Request("http://x/api/messages/send", { method: "POST", body: "{" }))).status).toBe(400);
  });

  it("تجاوز حدّ الإرسال = 429", async () => {
    m.send = { ok: false, reason: "rate-limited" };
    expect((await send.POST(post({ conversationId: 1, body: "a" }))).status).toBe(429);
  });

  it("نجاح الإرسال يردّ حتى لو فشل الإشعار داخل after()", async () => {
    m.send = {
      ok: true,
      message: { id: 1, fromMe: true, senderKind: "teacher", body: "a", createdAt: "2026-01-01T00:00:00.000Z" },
      conversation: { id: 1, kind: "teacher_student", halaqahId: 10, title: "ط" },
      recipients: [{ kind: "student", id: "10:s1" }],
    };
    const res = await send.POST(post({ conversationId: 1, body: "a" }));
    expect(res.status).toBe(200);
    expect(afterCbs).toHaveLength(1);
    await expect(afterCbs[0]()).resolves.toBeUndefined();
    expect(m.notify).toHaveBeenCalled();
  });

  it("المجموع فقط عبر summary=1", async () => {
    const res = await summary.GET(new Request("http://x/api/messages?summary=1"));
    expect(await res.json()).toEqual({ unreadTotal: 4 });
  });

  it("بدء محادثة غير مسموح = 403", async () => {
    expect((await start.POST(post({ kind: "teacher_student", studentId: "x" }))).status).toBe(403);
  });
});
