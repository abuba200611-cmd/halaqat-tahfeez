import "server-only";

import { sendPushToParent, sendPushToStudent, sendPushToTeacher, type PushPayload } from "./push";
import type { MessagingActor, ParticipantKind } from "./messaging";

/*
  إشعارات المراسلة (B2): عند كل رسالة جديدة يُنبَّه بقية أطراف المحادثة
  على أجهزتهم إن كانت لهم اشتراكات Web Push. تُستدعى من after() بمسار
  الإرسال ولا تُفشل الإرسال أبداً — كل فشل يُبتلع (نفس مبدأ lib/push).

  مدير الجامع لا يملك اشتراكات دفع (لا جدول لها) فيُتجاهل بصمت.
  النص يحمل اسم المرسل ومطلع الرسالة فقط، والرابط يفتح صندوق رسائل دور
  المستلم مباشرة.
*/

const URLS: Partial<Record<ParticipantKind, string>> = {
  teacher: "/messages",
  student: "/student/messages",
  parent: "/parent/messages",
};

/** ينبّه أطراف المحادثة الآخرين — لا يرمي أبداً */
export async function notifyMessageRecipients(input: {
  sender: MessagingActor;
  recipients: { kind: ParticipantKind; id: string }[];
  halaqahId: number | null;
  body: string;
  conversationId: number;
}): Promise<void> {
  const preview = input.body.length > 120 ? `${input.body.slice(0, 120)}…` : input.body;
  const payload: PushPayload = {
    title: `رسالة جديدة من ${input.sender.displayName || "مستخدم"}`,
    body: preview,
    url: "",
    tag: `msg-${input.conversationId}`,
  };

  await Promise.all(
    input.recipients.map(async (recipient) => {
      const url = URLS[recipient.kind];
      if (!url) return; // مدير الجامع: لا اشتراكات دفع
      try {
        const withUrl: PushPayload = { ...payload, url };
        if (recipient.kind === "teacher") {
          await sendPushToTeacher(Number(recipient.id), withUrl);
        } else if (recipient.kind === "student") {
          // محادثات الطالب كلها بحلقته (kind = teacher_student)
          await sendPushToStudent(input.halaqahId ?? 0, recipient.id, withUrl);
        } else {
          await sendPushToParent(Number(recipient.id), withUrl);
        }
      } catch {
        // لا شيء — إشعار فاشل لا يمسّ الرسالة
      }
    }),
  );
}
