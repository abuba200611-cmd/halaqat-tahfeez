import "server-only";

import { sendPushToParentsOfDiscipline } from "./push";
import { sendWhatsappToParentsOfStudent } from "./notify/outbox";

/*
  A2 — إشعارات الانضباط المشتركة بين مسارات المعلّم: تُستدعى داخل after()
  بعد الرد، مع سباق ٣ ثوان كنمط إشعارات المنصة — فشل الإشعار أو تجاوزه
  المهلة لا يغيّر نتيجة أي حفظ أبداً.
*/

/** إشعار أولياء الأمور بالأحداث الآلية الجديدة (إنذار/استدعاء) — الويب بوش ثم واتساب */
export async function notifyParentsOfLadderEvents(
  halaqahId: number,
  inserted: { studentId: string; notifyParent: boolean; kind: string; level: number }[],
): Promise<void> {
  const toNotify = inserted.filter((e) => e.notifyParent);
  await Promise.all(
    toNotify.map(async (event) => {
      try {
        await Promise.race([
          sendPushToParentsOfDiscipline(halaqahId, event.studentId, event.kind === "parent_summons" ? "summons" : "warning"),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // فشل الإشعار لا يغيّر نتيجة الحساب
      }
      // B1: واتساب لنفس الأولياء — بوابة الميزة والموافقة داخل المُرسِل، ومفتاح
      // التكرار يحاكي تفرد حدث السُلّم نفسه (الحلقة، الطالب، النوع، الدرجة)
      // فإعادة حساب السُلّم لا تكرر رسالة أبداً
      try {
        await Promise.race([
          sendWhatsappToParentsOfStudent({
            halaqahId,
            studentId: event.studentId,
            template: event.kind === "parent_summons" ? "parent_summons" : "absence_warning",
            paramsFor: (studentName) => ({ student_name: studentName }),
            refPrefix: `discipline:${halaqahId}:${event.studentId}:${event.kind}:${event.level}`,
          }),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // نفس مبدأ الويب بوش
      }
    }),
  );
}
