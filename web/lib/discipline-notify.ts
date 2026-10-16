import "server-only";

import { sendPushToParentsOfDiscipline } from "./push";

/*
  A2 — إشعارات الانضباط المشتركة بين مسارات المعلّم: تُستدعى داخل after()
  بعد الرد، مع سباق ٣ ثوان كنمط إشعارات المنصة — فشل الإشعار أو تجاوزه
  المهلة لا يغيّر نتيجة أي حفظ أبداً.
*/

/** إشعار أولياء الأمور بالأحداث الآلية الجديدة (إنذار/استدعاء) */
export async function notifyParentsOfLadderEvents(
  halaqahId: number,
  inserted: { studentId: string; notifyParent: boolean; kind: string }[],
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
    }),
  );
}
