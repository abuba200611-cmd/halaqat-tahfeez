import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  B2 — المراسلة الداخلية: نحاكي طبقة القاعدة والجلسات ونثبت قواعد الصلاحية
  (لا IDOR: غير الطرف لا يرى ولا يرسل، والعلاقات الحقيقية وحدها تبدأ
  محادثة، وعبر الجوامع محجوب)، والتحقق من الرسالة، وحدّ المعدل، وغير المقروء.
*/

type Row = Record<string, unknown>;
const sqlCalls: { text: string; values: unknown[] }[] = [];
/** مستجيب الاستعلام الحالي: يُضبط لكل اختبار حسب نص SQL */
let respond: (text: string, values: unknown[]) => Row[] = () => [];
const clientQueries: { text: string; values: unknown[] }[] = [];

vi.mock("./db", () => ({
  db: () => ({
    sql: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      return respond(text, values);
    },
    pool: {
      connect: async () => ({
        query: async (text: string, values: unknown[]) => {
          clientQueries.push({ text, values });
          return { rows: [{ id: 99 }] };
        },
        release: () => {},
      }),
    },
  }),
}));

const enabledMosques = new Set<number>();
vi.mock("./mosque/db", () => ({
  isFeatureEnabled: async (mosqueId: number) => enabledMosques.has(mosqueId),
}));

const allow = vi.hoisted(() => ({ value: true }));
vi.mock("./rate-limit", () => ({ checkRateLimit: vi.fn(async () => allow.value) }));
vi.mock("./auth", () => ({ currentTeacher: vi.fn(), currentStudent: vi.fn() }));
vi.mock("./parent-auth", () => ({ currentParent: vi.fn() }));
vi.mock("./mosque-auth", () => ({ currentMosqueAdmin: vi.fn() }));
vi.mock("./parent-db", () => ({ listParentChildren: vi.fn(async () => []) }));

import type { MessagingActor } from "./messaging";
const messaging = await import("./messaging");
const rateLimit = await import("./rate-limit");
const {
  sanitizeMessageBody,
  openConversationFor,
  sendMessage,
  startConversation,
  totalUnreadFor,
  listConversationsFor,
  studentParticipantId,
  MAX_MESSAGE_CHARS,
} = messaging;

const teacher: MessagingActor = {
  role: "teacher",
  participantId: "5",
  displayName: "المعلّم",
  teacherId: 5,
  halaqahId: 10,
};
const student: MessagingActor = {
  role: "student",
  participantId: studentParticipantId(10, "s1"),
  displayName: "طالب",
  halaqahId: 10,
  studentId: "s1",
};
const parent: MessagingActor = { role: "parent", participantId: "7", displayName: "ولي", parentId: 7 };
const admin: MessagingActor = {
  role: "mosque_admin",
  participantId: "3",
  displayName: "مدير",
  adminId: 3,
  mosqueId: 1,
};

beforeEach(() => {
  sqlCalls.length = 0;
  clientQueries.length = 0;
  respond = () => [];
  enabledMosques.clear();
  allow.value = true;
  vi.mocked(rateLimit.checkRateLimit).mockClear();
});

describe("التحقق من نص الرسالة", () => {
  it("يقصّ الأطراف ويرفض الفارغ وغير النصي", () => {
    expect(sanitizeMessageBody("  مرحبا  ")).toBe("مرحبا");
    expect(sanitizeMessageBody("   ")).toBeNull();
    expect(sanitizeMessageBody("")).toBeNull();
    expect(sanitizeMessageBody(123)).toBeNull();
    expect(sanitizeMessageBody(null)).toBeNull();
    expect(sanitizeMessageBody({ toString: () => "x" })).toBeNull();
  });

  it("يقبل ٢٠٠٠ محرف تماماً ويرفض ما فوقها", () => {
    expect(sanitizeMessageBody("ا".repeat(MAX_MESSAGE_CHARS))).toHaveLength(2000);
    expect(sanitizeMessageBody("ا".repeat(MAX_MESSAGE_CHARS + 1))).toBeNull();
  });

  it("لا يحوّل HTML — يبقى نصاً خاماً يعرضه العميل كنص", () => {
    expect(sanitizeMessageBody("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });
});

describe("فتح المحادثة — لا IDOR", () => {
  it("غير الطرف (لا صف عضوية) يُرجع null حتى لو المحادثة موجودة", async () => {
    respond = () => [];
    expect(await openConversationFor(teacher, 42)).toBeNull();
    const first = sqlCalls[0];
    // شرط العضوية داخل الاستعلام نفسه، مرتبطاً بنوع الفاعل ومعرّفه من الجلسة
    expect(first.text).toContain("JOIN conversation_participants me");
    expect(first.text).toContain("me.participant_id =");
    expect(first.values).toContain("teacher");
    expect(first.values).toContain("5");
  });

  it("الطرف يفتحها إن كانت ميزة جامعها مفعّلة، ويُحجب إن عُطّلت", async () => {
    respond = (text) =>
      text.includes("FROM conversations c")
        ? [{ id: 42, kind: "teacher_student", mosque_id: 1, halaqah_id: 10, student_id: "s1", teacher_name: "م", student_name: "ط" }]
        : [{ kind: "teacher", participant_id: "5" }];
    enabledMosques.add(1);
    expect((await openConversationFor(teacher, 42))?.id).toBe(42);
    enabledMosques.clear();
    expect(await openConversationFor(teacher, 42)).toBeNull();
  });
});

describe("الإرسال", () => {
  it("غير الطرف لا يرسل ولا يُحتسب على حدّه ولا يُدرج شيء", async () => {
    respond = () => [];
    const result = await sendMessage(teacher, 42, "مرحبا");
    expect(result).toEqual({ ok: false, reason: "not-participant" });
    expect(clientQueries).toHaveLength(0);
    expect(rateLimit.checkRateLimit).not.toHaveBeenCalled();
  });

  function asParticipant() {
    enabledMosques.add(1);
    respond = (text) => {
      if (text.includes("FROM conversations c"))
        return [{ id: 42, kind: "teacher_student", mosque_id: 1, halaqah_id: 10, student_id: "s1", teacher_name: "م", student_name: "ط" }];
      if (text.includes("SELECT kind, participant_id"))
        return [
          { kind: "teacher", participant_id: "5" },
          { kind: "student", participant_id: student.participantId },
        ];
      return [];
    };
  }

  it("يدرج الرسالة بهوية المرسل من الجلسة ويرجع المستلمين الآخرين فقط", async () => {
    asParticipant();
    const result = await sendMessage(teacher, 42, "مرحبا");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const insert = clientQueries.find((q) => q.text.includes("INSERT INTO messages"));
    expect(insert?.values.slice(0, 4)).toEqual([42, "teacher", "5", "مرحبا"]);
    expect(result.recipients).toEqual([{ kind: "student", id: student.participantId }]);
  });

  it("حدّ الإرسال ٣٠ رسالة/١٠ دقائق لكل مرسل — تجاوزه يمنع الإدراج", async () => {
    asParticipant();
    allow.value = false;
    const result = await sendMessage(teacher, 42, "مرحبا");
    expect(result).toEqual({ ok: false, reason: "rate-limited" });
    expect(rateLimit.checkRateLimit).toHaveBeenCalledWith("msg:teacher:5", 30, 600);
    expect(clientQueries.find((q) => q.text.includes("INSERT INTO messages"))).toBeUndefined();
  });
});

describe("بدء المحادثة — العلاقات الحقيقية فقط", () => {
  it("الطالب لا يبدأ مع معلّم حلقة أخرى (لا صف teachers بحلقته)", async () => {
    respond = () => [];
    const result = await startConversation(student, { kind: "teacher_student", teacherId: 99 });
    expect(result).toEqual({ ok: false, reason: "not-allowed" });
    const check = sqlCalls[0];
    expect(check.text).toContain("halaqah_id =");
    expect(check.values).toContain(10); // حلقة الطالب من الجلسة لا من الطلب
    expect(clientQueries).toHaveLength(0);
  });

  it("الطالب لا يبدأ محادثة أولياء أمور ولا إدارة", async () => {
    expect(await startConversation(student, { kind: "teacher_parent", studentId: "s1", halaqahId: 10, teacherId: 5 })).toEqual({
      ok: false,
      reason: "not-allowed",
    });
    expect(await startConversation(student, { kind: "admin_teacher", teacherId: 5 })).toEqual({ ok: false, reason: "not-allowed" });
  });

  it("المعلّم لا يبدأ مع طالب ليس بحلقته", async () => {
    respond = () => [];
    expect(await startConversation(teacher, { kind: "teacher_student", studentId: "other" })).toEqual({
      ok: false,
      reason: "not-allowed",
    });
  });

  it("المعلّم لا يبدأ مع ولي أمر غير مرتبط بطالب بحلقته", async () => {
    respond = () => [];
    expect(await startConversation(teacher, { kind: "teacher_parent", studentId: "s1", parentId: 8 })).toEqual({
      ok: false,
      reason: "not-allowed",
    });
  });

  it("ولي الأمر لا يبدأ إلا عبر ابنه الموثَّق", async () => {
    respond = () => [];
    expect(await startConversation(parent, { kind: "teacher_parent", studentId: "s1", halaqahId: 10, teacherId: 5 })).toEqual({
      ok: false,
      reason: "not-allowed",
    });
  });

  it("مدير الجامع لا يبدأ مع معلّم جامع آخر (عبر الجوامع محجوب)", async () => {
    respond = () => [{ mosque_id: 2 }];
    enabledMosques.add(1).add(2);
    expect(await startConversation(admin, { kind: "admin_teacher", teacherId: 5 })).toEqual({ ok: false, reason: "not-allowed" });
    expect(clientQueries).toHaveLength(0);
  });

  it("المعلّم لا يبدأ محادثة إدارة، والنوع المجهول مرفوض", async () => {
    expect(await startConversation(teacher, { kind: "admin_teacher", teacherId: 5 })).toEqual({ ok: false, reason: "not-allowed" });
    expect(await startConversation(teacher, { kind: "weird" })).toEqual({ ok: false, reason: "invalid" });
  });

  it("معرّفات غير صالحة = invalid", async () => {
    expect(await startConversation(admin, { kind: "admin_teacher", teacherId: "abc" })).toEqual({ ok: false, reason: "invalid" });
    expect(await startConversation(teacher, { kind: "teacher_student", studentId: "" })).toEqual({ ok: false, reason: "invalid" });
  });

  it("علاقة صحيحة بميزة مفعّلة تنشئ المحادثة بطرفيها (مفتاح تفرّد)", async () => {
    enabledMosques.add(1);
    respond = (text) => {
      if (text.includes("FROM students")) return [{ x: 1 }];
      if (text.includes("FROM halaqahs")) return [{ mosque_id: 1 }];
      return [];
    };
    const result = await startConversation(teacher, { kind: "teacher_student", studentId: "s1" });
    expect(result).toEqual({ ok: true, conversationId: 99 });
    const insert = clientQueries.find((q) => q.text.includes("INSERT INTO conversations"));
    expect(insert?.text).toContain("ON CONFLICT (dedup_key)");
    expect(insert?.values.at(-1)).toBe("ts:10:s1:5");
    const parts = clientQueries
      .filter((q) => q.text.includes("INSERT INTO conversation_participants"))
      .map((q) => q.values.slice(1));
    expect(parts).toEqual([
      ["teacher", "5"],
      ["student", "10:s1"],
    ]);
  });

  it("الميزة معطّلة = feature-off ولا إنشاء", async () => {
    respond = (text) => {
      if (text.includes("FROM students")) return [{ x: 1 }];
      if (text.includes("FROM halaqahs")) return [{ mosque_id: 1 }];
      return [];
    };
    expect(await startConversation(teacher, { kind: "teacher_student", studentId: "s1" })).toEqual({
      ok: false,
      reason: "feature-off",
    });
    expect(clientQueries).toHaveLength(0);
  });
});

describe("غير المقروء", () => {
  it("يُجمَّع عبر الجوامع المفعّلة فقط", async () => {
    enabledMosques.add(1);
    respond = () => [
      { mosque_id: 1, unread: "3" },
      { mosque_id: 2, unread: "5" }, // معطّل
    ];
    expect(await totalUnreadFor(teacher)).toBe(3);
  });

  it("يستثني رسائل المرسل نفسه ويقارن بآخر قراءة ضمن الاستعلام", async () => {
    respond = () => [];
    await totalUnreadFor(parent);
    const text = sqlCalls[0].text;
    expect(text).toContain("msg.created_at > COALESCE(me.last_read_at");
    expect(text).toContain("NOT (msg.sender_kind =");
    expect(sqlCalls[0].values).toContain("parent");
    expect(sqlCalls[0].values).toContain("7");
  });

  it("صندوق الوارد يحمل غير المقروء لكل محادثة ويخفي محادثات الجامع المعطّل", async () => {
    enabledMosques.add(1);
    respond = () => [
      { id: 1, kind: "teacher_student", mosque_id: 1, halaqah_id: 10, student_id: "s1", teacher_id: 5, unread: "2", student_name: "ط", last_sender_kind: "student", last_sender_id: "10:s1" },
      { id: 2, kind: "teacher_student", mosque_id: 2, halaqah_id: 11, student_id: "s9", teacher_id: 5, unread: "4", student_name: "ز" },
    ];
    const list = await listConversationsFor(teacher);
    expect(list.map((c) => [c.id, c.unread])).toEqual([[1, 2]]);
    expect(list[0].title).toBe("ط");
  });
});
