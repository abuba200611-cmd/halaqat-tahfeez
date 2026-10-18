import "server-only";

import { currentTeacher, currentStudent } from "./auth";
import { currentParent } from "./parent-auth";
import { currentMosqueAdmin } from "./mosque-auth";
import { db } from "./db";
import { isFeatureEnabled } from "./mosque/db";
import { checkRateLimit } from "./rate-limit";
import { listParentChildren } from "./parent-db";

/*
  B2 — المراسلة الداخلية. محادثات معلّم ↔ ولي أمر (لكل طالب على حدة)
  ومعلّم ↔ طالب وإدارة جامع ↔ معلّم. كل الوصول يمرّ من هنا، وكل فحص
  صلاحية خادمي:

  - الفاعل من جلسات الأدوار القائمة نفسها (كوكيز المعلّم/الطالب/ولي
    الأمر/مدير الجامع)؛ الجهاز الواحد قد يحمل أكثر من جلسة، فالمستدعي
    يحدّد الدور بمعامل role والخادم يتحقق من جلسة ذلك الدور فعلاً.
  - لا فتح ولا قراءة ولا إرسال إلا لطرف في المحادثة (شرط العضوية داخل
    الاستعلام نفسه) — لا IDOR.
  - بدء محادثة لا يُقبل إلا عبر علاقة حقيقية موثَّقة بالقاعدة: المعلّم مع
    أولياء أمور وطلاب حلقته فقط، والطالب مع معلّمي حلقته فقط، وولي الأمر
    مع معلّمي أبنائه، ومدير الجامع مع معلّمي جامعه — والطالب/الولي لا
    يبدآن محادثة إدارة (المدير وحده يبدؤها).
  - الميزة "messaging" على مستوى الجامع: معطّلة = محادثاته مخفية كلياً.
  - الرسالة نص مقصوص الأطراف ≤ ٢٠٠٠ محرف، يُعرض نصاً عادياً بلا HTML.
*/

export type ParticipantKind = "teacher" | "student" | "parent" | "mosque_admin";
export type ConversationKind = "teacher_parent" | "teacher_student" | "admin_teacher";
export type MessagingRole = ParticipantKind;

export type MessagingActor = {
  role: MessagingRole;
  /** معرّف الطرف كما يُخزَّن بجدول الأطراف (نصّي — معرّف الطالب نص) */
  participantId: string;
  /** تسمية صاحب الجلسة لنص إشعار «رسالة جديدة من …» */
  displayName: string;
  teacherId?: number;
  halaqahId?: number;
  studentId?: string;
  parentId?: number;
  adminId?: number;
  mosqueId?: number;
};

export const MESSAGING_FEATURE = "messaging";

/** حدّ الإرسال: ٣٠ رسالة كل ١٠ دقائق لكل مرسل */
const SEND_LIMIT = 30;
const SEND_WINDOW_SECONDS = 600;

export const MAX_MESSAGE_CHARS = 2000;

/**
 * هوية الطالب كطرف: (الحلقة:المعرّف) — مفتاح students مركّب (teacher_id, id)،
 * فمعرّف الطالب وحده قد يتكرر بين حلقتين ولا يصلح هوية مستقلة.
 */
export const studentParticipantId = (halaqahId: number, studentId: string): string => `${halaqahId}:${studentId}`;

/** يقرأ الجلسة الصالحة للدور المطلوب فقط — أو null. role محدَّد = جلسة ذلك الدور حصراً. */
async function actorForRole(role: MessagingRole): Promise<MessagingActor | null> {
  if (role === "teacher") {
    const teacher = await currentTeacher();
    if (!teacher) return null;
    return {
      role,
      participantId: String(teacher.id),
      displayName: teacher.teacherName || teacher.username,
      teacherId: teacher.id,
      halaqahId: teacher.halaqahId,
    };
  }
  if (role === "student") {
    const student = await currentStudent();
    if (!student) return null;
    return {
      role,
      participantId: studentParticipantId(student.teacherId, student.id),
      displayName: student.name,
      halaqahId: student.teacherId,
      studentId: student.id,
    };
  }
  if (role === "parent") {
    const parent = await currentParent();
    if (!parent) return null;
    return { role, participantId: String(parent.id), displayName: parent.name, parentId: parent.id };
  }
  const admin = await currentMosqueAdmin();
  if (!admin) return null;
  return { role, participantId: String(admin.id), displayName: admin.username, adminId: admin.id, mosqueId: admin.mosqueId };
}

/**
 * فاعل المراسلة للطلب الحالي. الأولوية بلا معامل role: معلّم ثم طالب ثم
 * ولي أمر ثم مدير جامع (أول كوكي صالح) — واجهات الأدوار تمرّر role دائماً
 * فلا تلتبس الأدوار على جهاز يحمل أكثر من جلسة.
 */
export async function resolveMessagingActor(role?: unknown): Promise<MessagingActor | null> {
  if (role === "teacher" || role === "student" || role === "parent" || role === "mosque_admin") {
    return actorForRole(role);
  }
  return (
    (await actorForRole("teacher")) ??
    (await actorForRole("student")) ??
    (await actorForRole("parent")) ??
    (await actorForRole("mosque_admin"))
  );
}

/** جامع حلقة — null إن لم تربط بعد بنظام الجوامع */
async function mosqueIdOfHalaqah(halaqahId: number): Promise<number | null> {
  const rows = await db().sql`SELECT mosque_id FROM halaqahs WHERE id = ${halaqahId}`;
  const mosqueId = rows[0]?.mosque_id;
  return typeof mosqueId === "number" ? mosqueId : null;
}

/** كشف صغير يُمرَّر بين فحوص الطلب: هل الميزة مفعّلة لجامع؟ (بلا تكرار الاستعلام) */
export type FeatureCache = Map<number, boolean>;
export async function messagingEnabled(cache: FeatureCache, mosqueId: number): Promise<boolean> {
  const cached = cache.get(mosqueId);
  if (cached !== undefined) return cached;
  const enabled = await isFeatureEnabled(mosqueId, MESSAGING_FEATURE);
  cache.set(mosqueId, enabled);
  return enabled;
}

/**
 * جامع الفاعل إن كان واحداً ثابتاً (معلّم/طالب/مدير) مع فحص الميزة:
 * يرجع معرّف الجامع، أو -1 إن حلقة بلا جامع أو ميزة معطّلة. ولي الأمر
   وحده بلا جامع واحد (أبناء في جوامع عدة) — يرجع null وتُفحص ميزة كل
   جامع عند كل محادثة/بدء على حدة.
 */
export async function actorFeatureGate(actor: MessagingActor): Promise<number | null | -1> {
  if (actor.role === "parent") return null;
  const mosqueId = actor.mosqueId ?? (actor.halaqahId ? await mosqueIdOfHalaqah(actor.halaqahId) : null);
  if (mosqueId === null) return -1;
  return (await isFeatureEnabled(mosqueId, MESSAGING_FEATURE)) ? mosqueId : -1;
}

// ————— أدوات عرض —————

/** تسمية المعلّم المعروضة: الاسم ثم اسم المستخدم إن لم يوجد */
const teacherLabel = (teacherName: string | null, username: string | null): string =>
  (teacherName && teacherName.trim()) || (username ?? "معلّم");

const iso = (value: string | Date | null | undefined): string | null => {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

export type ConversationRow = {
  id: number;
  kind: ConversationKind;
  mosqueId: number;
  halaqahId: number | null;
  studentId: string | null;
  teacherId: number | null;
  parentId: number | null;
  adminId: number | null;
  title: string;
  /** سطر ثانوي اختياري تحت العنوان (اسم الطالب/الحلقة/الجامع) */
  sub: string | null;
  lastMessageAt: string | null;
  lastBody: string | null;
  lastFromMe: boolean;
  unread: number;
};

type RawConversation = {
  id: number | string;
  kind: ConversationKind;
  mosque_id: number;
  halaqah_id: number | null;
  student_id: string | null;
  teacher_id: number | null;
  parent_id: number | null;
  admin_id: number | null;
  last_message_at: string | Date | null;
  teacher_name: string | null;
  teacher_username: string | null;
  teacher_halaqah_name: string | null;
  student_name: string | null;
  parent_name: string | null;
  mosque_name: string | null;
  last_body: string | null;
  last_sender_kind: ParticipantKind | null;
  last_sender_id: string | null;
};

/** عنوان المحادثة بعين الطرف المشاهد — الطرف الآخر دائماً */
function conversationTitle(row: RawConversation, viewerRole: MessagingRole): { title: string; sub: string | null } {
  const teacherName = teacherLabel(row.teacher_name, row.teacher_username);
  if (viewerRole === "teacher") {
    if (row.kind === "teacher_student") return { title: row.student_name ?? "طالب", sub: null };
    if (row.kind === "teacher_parent")
      return { title: row.parent_name ?? "ولي أمر", sub: row.student_name ? `ولي أمر ${row.student_name}` : null };
    return { title: "إدارة الجامع", sub: row.mosque_name ?? null };
  }
  if (viewerRole === "student") return { title: teacherName, sub: null };
  if (viewerRole === "parent") return { title: teacherName, sub: row.student_name ? `معلّم ${row.student_name}` : null };
  return { title: teacherName, sub: row.teacher_halaqah_name ?? null };
}

function rowToConversation(
  row: RawConversation & { unread?: number | string },
  viewer: MessagingActor,
): ConversationRow {
  const { title, sub } = conversationTitle(row, viewer.role);
  return {
    id: Number(row.id),
    kind: row.kind,
    mosqueId: Number(row.mosque_id),
    halaqahId: row.halaqah_id === null ? null : Number(row.halaqah_id),
    studentId: row.student_id ?? null,
    teacherId: row.teacher_id === null ? null : Number(row.teacher_id),
    parentId: row.parent_id === null ? null : Number(row.parent_id),
    adminId: row.admin_id === null ? null : Number(row.admin_id),
    title,
    sub,
    lastMessageAt: iso(row.last_message_at),
    lastBody: row.last_body ?? null,
    lastFromMe: row.last_sender_kind === viewer.role && row.last_sender_id === viewer.participantId,
    unread: Number(row.unread ?? 0),
  };
}

/**
 * صندوق وارد الفاعل — محادثاته فقط (شرط العضوية داخل الاستعلام نفسه:
  JOIN conversation_participants على نوعه ومعرّفه)، مع غير المقروء
  (رسائل بعد آخر قراءة ليست منّي) وحجب محادثات الجوامع المعطّلة.
 */
export async function listConversationsFor(actor: MessagingActor): Promise<ConversationRow[]> {
  const rows = (await db().sql`
    SELECT c.id, c.kind, c.mosque_id, c.halaqah_id, c.student_id, c.teacher_id, c.parent_id, c.admin_id,
           c.last_message_at,
           t.teacher_name, t.username AS teacher_username, th.name AS teacher_halaqah_name,
           s.name AS student_name, p.name AS parent_name, m.name AS mosque_name,
           lm.body AS last_body, lm.sender_kind AS last_sender_kind, lm.sender_id AS last_sender_id,
           (SELECT COUNT(*) FROM messages msg
            WHERE msg.conversation_id = c.id AND msg.deleted_at IS NULL
              AND msg.created_at > COALESCE(me.last_read_at, to_timestamp(0))
              AND NOT (msg.sender_kind = ${actor.role} AND msg.sender_id = ${actor.participantId})
           ) AS unread
    FROM conversations c
    JOIN conversation_participants me
      ON me.conversation_id = c.id AND me.kind = ${actor.role} AND me.participant_id = ${actor.participantId}
    LEFT JOIN teachers t ON t.id = c.teacher_id
    LEFT JOIN halaqahs th ON th.id = t.halaqah_id
    LEFT JOIN students s ON s.teacher_id = c.halaqah_id AND s.id = c.student_id
    LEFT JOIN parents p ON p.id = c.parent_id
    LEFT JOIN mosques m ON m.id = c.mosque_id
    LEFT JOIN LATERAL (
      SELECT body, sender_kind, sender_id FROM messages
      WHERE conversation_id = c.id AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1
    ) lm ON TRUE
    ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC
  `) as (RawConversation & { unread?: number | string })[];

  const cache: FeatureCache = new Map();
  const visible: ConversationRow[] = [];
  for (const row of rows) {
    const conversation = rowToConversation(row, actor);
    if (await messagingEnabled(cache, conversation.mosqueId)) visible.push(conversation);
  }
  return visible;
}

/** مجموع غير المقروء فقط — لوسم شريط التنقّل (يحترم تعطيل الميزة بالجامع) */
export async function totalUnreadFor(actor: MessagingActor): Promise<number> {
  const rows = await db().sql`
    SELECT c.mosque_id,
           COUNT(msg.id) AS unread
    FROM conversations c
    JOIN conversation_participants me
      ON me.conversation_id = c.id AND me.kind = ${actor.role} AND me.participant_id = ${actor.participantId}
    JOIN messages msg
      ON msg.conversation_id = c.id AND msg.deleted_at IS NULL
     AND msg.created_at > COALESCE(me.last_read_at, to_timestamp(0))
     AND NOT (msg.sender_kind = ${actor.role} AND msg.sender_id = ${actor.participantId})
    GROUP BY c.mosque_id
  `;
  const cache: FeatureCache = new Map();
  let total = 0;
  for (const row of rows) {
    if (await messagingEnabled(cache, Number(row.mosque_id))) total += Number(row.unread ?? 0);
  }
  return total;
}

// ————— فتح محادثة والتحقق من العضوية —————

export type ConversationAccess = {
  id: number;
  kind: ConversationKind;
  mosqueId: number;
  halaqahId: number | null;
  studentId: string | null;
  title: string;
  /** أطراف المحادثة — لإشعارات الإرسال */
  participants: { kind: ParticipantKind; id: string }[];
};

/**
 * فتح محادثة لهذا الفاعل: شرط العضوية داخل الاستعلام نفسه (لا صف = لست
 * طرفاً أو غير موجودة — نفس الحالين تماماً)، ثم فحص ميزة جامعها. يرجع
 * null والمسار يردّ 404 فلا يكشف وجود المحادثة لغير أطرافها.
 */
export async function openConversationFor(
  actor: MessagingActor,
  conversationId: number,
  cache?: FeatureCache,
): Promise<ConversationAccess | null> {
  const rows = (await db().sql`
    SELECT c.id, c.kind, c.mosque_id, c.halaqah_id, c.student_id,
           t.teacher_name, t.username AS teacher_username, th.name AS teacher_halaqah_name,
           s.name AS student_name, p.name AS parent_name, m.name AS mosque_name
    FROM conversations c
    JOIN conversation_participants me
      ON me.conversation_id = c.id AND me.kind = ${actor.role} AND me.participant_id = ${actor.participantId}
    LEFT JOIN teachers t ON t.id = c.teacher_id
    LEFT JOIN halaqahs th ON th.id = t.halaqah_id
    LEFT JOIN students s ON s.teacher_id = c.halaqah_id AND s.id = c.student_id
    LEFT JOIN parents p ON p.id = c.parent_id
    LEFT JOIN mosques m ON m.id = c.mosque_id
    WHERE c.id = ${conversationId}
    LIMIT 1
  `) as RawConversation[];
  const row = rows[0];
  if (!row) return null;
  if (!(await messagingEnabled(cache ?? new Map(), Number(row.mosque_id)))) return null;

  const participantRows = await db().sql`
    SELECT kind, participant_id FROM conversation_participants WHERE conversation_id = ${conversationId}
  `;
  const { title } = conversationTitle(row, actor.role);
  return {
    id: Number(row.id),
    kind: row.kind,
    mosqueId: Number(row.mosque_id),
    halaqahId: row.halaqah_id === null ? null : Number(row.halaqah_id),
    studentId: row.student_id ?? null,
    title,
    participants: participantRows.map((p) => ({ kind: p.kind as ParticipantKind, id: p.participant_id as string })),
  };
}

export type MessageRow = {
  id: number;
  fromMe: boolean;
  senderKind: ParticipantKind;
  body: string;
  createdAt: string;
};

export const MESSAGE_PAGE_SIZE = 30;

/** رسائل محادثة (تصاعدياً للعرض) بصفحنة بالمؤشر — المستدعي طرف متحقَّق منه مسبقاً */
export async function listMessages(
  actor: MessagingActor,
  conversationId: number,
  before?: number | null,
): Promise<{ messages: MessageRow[]; nextBefore: number | null }> {
  const cursor = typeof before === "number" && Number.isSafeInteger(before) && before > 0 ? before : null;
  const rows = cursor
    ? await db().sql`
        SELECT id, sender_kind, sender_id, body, created_at FROM messages
        WHERE conversation_id = ${conversationId} AND deleted_at IS NULL AND id < ${cursor}
        ORDER BY id DESC LIMIT ${MESSAGE_PAGE_SIZE + 1}
      `
    : await db().sql`
        SELECT id, sender_kind, sender_id, body, created_at FROM messages
        WHERE conversation_id = ${conversationId} AND deleted_at IS NULL
        ORDER BY id DESC LIMIT ${MESSAGE_PAGE_SIZE + 1}
      `;
  const page = rows.slice(0, MESSAGE_PAGE_SIZE);
  const messages: MessageRow[] = page
    .map((row) => ({
      id: Number(row.id),
      fromMe: row.sender_kind === actor.role && row.sender_id === actor.participantId,
      senderKind: row.sender_kind as ParticipantKind,
      body: row.body as string,
      createdAt: iso(row.created_at as string | Date) ?? "",
    }))
    .reverse();
  return {
    messages,
    nextBefore: rows.length > MESSAGE_PAGE_SIZE && page.length > 0 ? Number(page[page.length - 1].id) : null,
  };
}

/** تعليم المحادثة مقروءة الآن — مشروط بعضوية الفاعل داخل UPDATE نفسه */
export async function markConversationRead(actor: MessagingActor, conversationId: number): Promise<boolean> {
  const rows = await db().sql`
    UPDATE conversation_participants SET last_read_at = now()
    WHERE conversation_id = ${conversationId} AND kind = ${actor.role} AND participant_id = ${actor.participantId}
    RETURNING conversation_id
  `;
  return rows.length > 0;
}

// ————— الإرسال —————

/** نص رسالة صالح: مقصوص الأطراف، غير فارغ، ≤ ٢٠٠٠ محرف — أو null */
export function sanitizeMessageBody(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const body = input.trim();
  if (!body || body.length > MAX_MESSAGE_CHARS) return null;
  return body;
}

export type SendResult =
  | {
      ok: true;
      message: MessageRow;
      conversation: { id: number; kind: ConversationKind; halaqahId: number | null; title: string };
      recipients: { kind: ParticipantKind; id: string }[];
    }
  | { ok: false; reason: "not-participant" | "rate-limited" };

/**
 * إرسال رسالة: عضوية + ميزة الجامع + حدّ المعدل (٣٠ رسالة/١٠ دقائق لكل
 * مرسل، بمفتاح النوع والمعرّف)، ثم إدراج الرسالة وتحديث آخر نشاط
 * بالمحادثة بترانزاكشن واحدة.
 */
export async function sendMessage(actor: MessagingActor, conversationId: number, body: string): Promise<SendResult> {
  const access = await openConversationFor(actor, conversationId);
  if (!access) return { ok: false, reason: "not-participant" };

  const allowed = await checkRateLimit(`msg:${actor.role}:${actor.participantId}`, SEND_LIMIT, SEND_WINDOW_SECONDS);
  if (!allowed) return { ok: false, reason: "rate-limited" };

  const now = new Date();
  const client = await db().pool.connect();
  let insertedId: number;
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO messages (conversation_id, sender_kind, sender_id, body, created_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [conversationId, actor.role, actor.participantId, body, now],
    );
    insertedId = Number(inserted.rows[0].id);
    await client.query(`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, [conversationId, now]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    client.release();
    throw error;
  }
  client.release();

  // رسالتي نفسها مقروءة عندي: تحديث آخر قراءة الآن فلا تُحسب غير مقروء عندي
  await markConversationRead(actor, conversationId);

  return {
    ok: true,
    message: { id: insertedId, fromMe: true, senderKind: actor.role, body, createdAt: now.toISOString() },
    conversation: { id: access.id, kind: access.kind, halaqahId: access.halaqahId, title: access.title },
    recipients: access.participants.filter((p) => !(p.kind === actor.role && p.id === actor.participantId)),
  };
}

// ————— بدء المحادثة —————

export type StartInput = {
  kind: unknown;
  teacherId?: unknown;
  studentId?: unknown;
  parentId?: unknown;
  halaqahId?: unknown;
};

const positiveInt = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    const num = Number(value);
    if (Number.isSafeInteger(num) && num > 0) return num;
  }
  return null;
};

const studentIdOf = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" && value.length <= 100 ? value : null;

export type StartResult =
  | { ok: true; conversationId: number }
  | { ok: false; reason: "invalid" | "not-allowed" | "feature-off" };

/** dedup_key — قيد التفرد: محادثة واحدة لكل (النوع + الأطراف) مهما تكرر الطلب */
function dedupKey(kind: ConversationKind, ids: { halaqahId?: number; studentId?: string; teacherId: number; parentId?: number; adminId?: number }): string {
  if (kind === "teacher_parent")
    return `tp:${ids.halaqahId}:${ids.studentId}:${ids.teacherId}:${ids.parentId}`;
  if (kind === "teacher_student") return `ts:${ids.halaqahId}:${ids.studentId}:${ids.teacherId}`;
  return `at:${ids.adminId}:${ids.teacherId}`;
}

/**
 * بدء (أو إيجاد القائمة من) محادثة — كل مسار يتحقق من علاقة حقيقية
 * موثَّقة بالقاعدة قبل الإنشاء، والقواعد:
  المعلّم مع حلقته فقط، الطالب مع معلّمي حلقته (ومعرّفه هو من الجلسة لا
  من الطلب)، ولي الأمر مع معلّمي أبنائه الموثَّقين، ومدير الجامع مع
  معلّمي جامعه — ومحادثة الإدارة يبدؤها المدير وحده.
 */
export async function startConversation(actor: MessagingActor, input: StartInput): Promise<StartResult> {
  const cache: FeatureCache = new Map();

  if (input.kind === "admin_teacher") {
    if (actor.role !== "mosque_admin") return { ok: false, reason: "not-allowed" };
    const teacherId = positiveInt(input.teacherId);
    if (!teacherId) return { ok: false, reason: "invalid" };
    const rows = await db().sql`
      SELECT h.mosque_id FROM teachers t JOIN halaqahs h ON h.id = t.halaqah_id
      WHERE t.id = ${teacherId} AND t.deactivated_at IS NULL
    `;
    const mosqueId = rows[0] ? Number(rows[0].mosque_id) : null;
    if (mosqueId === null || actor.mosqueId !== mosqueId) return { ok: false, reason: "not-allowed" };
    if (!(await messagingEnabled(cache, mosqueId))) return { ok: false, reason: "feature-off" };
    return createConversation(mosqueId, "admin_teacher", { teacherId, adminId: actor.adminId! }, [
      { kind: "teacher", id: String(teacherId) },
      { kind: "mosque_admin", id: actor.participantId },
    ]);
  }

  if (input.kind === "teacher_student") {
    if (actor.role === "teacher") {
      const studentId = studentIdOf(input.studentId);
      if (!studentId) return { ok: false, reason: "invalid" };
      const student = await db().sql`
        SELECT 1 FROM students
        WHERE teacher_id = ${actor.halaqahId} AND id = ${studentId} AND deleted_at IS NULL
      `;
      if (!student[0]) return { ok: false, reason: "not-allowed" };
      const mosqueId = await actorFeatureGate(actor);
      if (mosqueId === -1) return { ok: false, reason: "feature-off" };
      return createConversation(
        mosqueId!,
        "teacher_student",
        { halaqahId: actor.halaqahId, studentId, teacherId: actor.teacherId! },
        [
          { kind: "teacher", id: actor.participantId },
          { kind: "student", id: studentParticipantId(actor.halaqahId!, studentId) },
        ],
      );
    }
    if (actor.role === "student") {
      const teacherId = positiveInt(input.teacherId);
      if (!teacherId) return { ok: false, reason: "invalid" };
      const teacher = await db().sql`
        SELECT 1 FROM teachers
        WHERE id = ${teacherId} AND halaqah_id = ${actor.halaqahId} AND deactivated_at IS NULL
      `;
      if (!teacher[0]) return { ok: false, reason: "not-allowed" };
      const mosqueId = await actorFeatureGate(actor);
      if (mosqueId === -1) return { ok: false, reason: "feature-off" };
      return createConversation(
        mosqueId!,
        "teacher_student",
        { halaqahId: actor.halaqahId, studentId: actor.studentId, teacherId },
        [
          { kind: "student", id: actor.participantId },
          { kind: "teacher", id: String(teacherId) },
        ],
      );
    }
    return { ok: false, reason: "not-allowed" };
  }

  if (input.kind === "teacher_parent") {
    const studentId = studentIdOf(input.studentId);
    if (!studentId) return { ok: false, reason: "invalid" };
    if (actor.role === "teacher") {
      const parentId = positiveInt(input.parentId);
      if (!parentId) return { ok: false, reason: "invalid" };
      const link = await db().sql`
        SELECT 1 FROM parent_children pc
        JOIN students s ON s.teacher_id = pc.halaqah_id AND s.id = pc.student_id
        WHERE pc.halaqah_id = ${actor.halaqahId} AND pc.student_id = ${studentId}
          AND pc.parent_id = ${parentId} AND s.deleted_at IS NULL
      `;
      if (!link[0]) return { ok: false, reason: "not-allowed" };
      const mosqueId = await actorFeatureGate(actor);
      if (mosqueId === -1) return { ok: false, reason: "feature-off" };
      return createConversation(
        mosqueId!,
        "teacher_parent",
        { halaqahId: actor.halaqahId, studentId, teacherId: actor.teacherId!, parentId },
        [
          { kind: "teacher", id: actor.participantId },
          { kind: "parent", id: String(parentId) },
        ],
      );
    }
    if (actor.role === "parent") {
      const halaqahId = positiveInt(input.halaqahId);
      const teacherId = positiveInt(input.teacherId);
      if (!halaqahId || !teacherId) return { ok: false, reason: "invalid" };
      const child = await db().sql`
        SELECT 1 FROM parent_children pc
        JOIN students s ON s.teacher_id = pc.halaqah_id AND s.id = pc.student_id
        WHERE pc.parent_id = ${actor.parentId} AND pc.halaqah_id = ${halaqahId}
          AND pc.student_id = ${studentId} AND s.deleted_at IS NULL
      `;
      if (!child[0]) return { ok: false, reason: "not-allowed" };
      const teacher = await db().sql`
        SELECT 1 FROM teachers
        WHERE id = ${teacherId} AND halaqah_id = ${halaqahId} AND deactivated_at IS NULL
      `;
      if (!teacher[0]) return { ok: false, reason: "not-allowed" };
      const mosqueId = await mosqueIdOfHalaqah(halaqahId);
      if (mosqueId === null) return { ok: false, reason: "feature-off" };
      if (!(await messagingEnabled(cache, mosqueId))) return { ok: false, reason: "feature-off" };
      return createConversation(
        mosqueId,
        "teacher_parent",
        { halaqahId, studentId, teacherId, parentId: actor.parentId! },
        [
          { kind: "parent", id: actor.participantId },
          { kind: "teacher", id: String(teacherId) },
        ],
      );
    }
    return { ok: false, reason: "not-allowed" };
  }

  return { ok: false, reason: "invalid" };
}

/**
 * إنشاء المحادثة بذرّية: ON CONFLICT (dedup_key) بتحديث صوري (لا يغيّر
 * قيمة) كي يعيد RETURNING الصف القائم أيضاً — فطلبان متوازيان «يبدآن»
 * المحادثة نفسها ويحصلان على المعرف نفسه، ثم إدراج الطرفين بلا تعارض.
 */
async function createConversation(
  mosqueId: number,
  kind: ConversationKind,
  ids: { halaqahId?: number; studentId?: string; teacherId: number; parentId?: number; adminId?: number },
  participants: { kind: ParticipantKind; id: string }[],
): Promise<StartResult> {
  const key = dedupKey(kind, ids);
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO conversations (mosque_id, kind, halaqah_id, student_id, teacher_id, parent_id, admin_id, dedup_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (dedup_key) DO UPDATE SET dedup_key = excluded.dedup_key
       RETURNING id`,
      [mosqueId, kind, ids.halaqahId ?? null, ids.studentId ?? null, ids.teacherId, ids.parentId ?? null, ids.adminId ?? null, key],
    );
    const conversationId = Number(inserted.rows[0].id);
    for (const participant of participants) {
      await client.query(
        `INSERT INTO conversation_participants (conversation_id, kind, participant_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [conversationId, participant.kind, participant.id],
      );
    }
    await client.query("COMMIT");
    return { ok: true, conversationId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// ————— جهات الاتصال (بمن يجوز بدء محادثة معه) —————

export type ContactOption = {
  kind: ConversationKind;
  teacherId?: number;
  studentId?: string;
  parentId?: number;
  halaqahId?: number;
  label: string;
  sub: string | null;
};

/** معلّمو حلقة (بلا الموقوفين) — المشرف أولاً */
async function halaqahTeacherContacts(halaqahId: number): Promise<{ id: number; name: string }[]> {
  const rows = await db().sql`
    SELECT id, teacher_name, username FROM teachers
    WHERE halaqah_id = ${halaqahId} AND deactivated_at IS NULL
    ORDER BY (role = 'supervisor') DESC, created_at
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    name: teacherLabel(r.teacher_name as string | null, r.username as string | null),
  }));
}

async function teacherContacts(actor: MessagingActor): Promise<ContactOption[]> {
  const students = await db().sql`
    SELECT id, name FROM students
    WHERE teacher_id = ${actor.halaqahId} AND deleted_at IS NULL
    ORDER BY sort_order, name
  `;
  const studentName = new Map(students.map((s) => [s.id as string, s.name as string]));
  const parents = await db().sql`
    SELECT pc.student_id, p.id AS parent_id, p.name AS parent_name FROM parent_children pc
    JOIN parents p ON p.id = pc.parent_id
    JOIN students s ON s.teacher_id = pc.halaqah_id AND s.id = pc.student_id
    WHERE pc.halaqah_id = ${actor.halaqahId} AND s.deleted_at IS NULL
    ORDER BY s.name, p.name
  `;
  const contacts: ContactOption[] = students.map((s) => ({
    kind: "teacher_student",
    studentId: s.id as string,
    label: s.name as string,
    sub: "طالب",
  }));
  for (const p of parents) {
    const name = studentName.get(p.student_id as string);
    contacts.push({
      kind: "teacher_parent",
      studentId: p.student_id as string,
      parentId: Number(p.parent_id),
      label: p.parent_name as string,
      sub: name ? `ولي أمر ${name}` : "ولي أمر",
    });
  }
  return contacts;
}

async function studentContacts(actor: MessagingActor): Promise<ContactOption[]> {
  const teachers = await halaqahTeacherContacts(actor.halaqahId!);
  return teachers.map((t) => ({ kind: "teacher_student" as const, teacherId: t.id, label: t.name, sub: "معلّمي" }));
}

async function parentContacts(actor: MessagingActor): Promise<ContactOption[]> {
  const children = await listParentChildren(actor.parentId!);
  const contacts: ContactOption[] = [];
  for (const child of children) {
    for (const teacher of await halaqahTeacherContacts(child.halaqahId)) {
      contacts.push({
        kind: "teacher_parent",
        halaqahId: child.halaqahId,
        studentId: child.studentId,
        teacherId: teacher.id,
        label: teacher.name,
        sub: `معلّم ${child.studentName}`,
      });
    }
  }
  return contacts;
}

async function adminContacts(actor: MessagingActor): Promise<ContactOption[]> {
  const rows = await db().sql`
    SELECT t.id, t.teacher_name, t.username, h.name AS halaqah_name
    FROM teachers t JOIN halaqahs h ON h.id = t.halaqah_id
    WHERE h.mosque_id = ${actor.mosqueId} AND t.deactivated_at IS NULL
    ORDER BY h.name, (t.role = 'supervisor') DESC, t.created_at
  `;
  return rows.map((r) => ({
    kind: "admin_teacher" as const,
    teacherId: Number(r.id),
    label: teacherLabel(r.teacher_name as string | null, r.username as string | null),
    sub: r.halaqah_name as string,
  }));
}

/** جهات اتصال الفاعل — من يجوز له بدء محادثة معه الآن */
export async function contactOptionsFor(actor: MessagingActor): Promise<ContactOption[]> {
  if (actor.role === "teacher") return teacherContacts(actor);
  if (actor.role === "student") return studentContacts(actor);
  if (actor.role === "parent") return parentContacts(actor);
  return adminContacts(actor);
}
