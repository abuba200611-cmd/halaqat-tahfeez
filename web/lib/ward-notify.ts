import { after } from "next/server";
import { emitHalaqahEvent } from "@/lib/webhooks-db";
import { progressApprovedPayload, progressRecordedPayload } from "@/lib/webhooks";
import { sendPushToParentsOfStudent, sendPushToStudent } from "@/lib/push";
import { sendWhatsappToParentsOfStudent } from "@/lib/notify/outbox";
import type { AyahRange, WardStatus } from "@/lib/types";

/*
  إشعارات قرار الورد (001 T017): الكتلة المستخرَجة حرفياً من after()
  بمسار PATCH /api/wards — نفس الإشعارات وبنفس الترتيب (طالب ثم أولياء
  الأمور بوش ثم واتساب، كلٌّ بسقف ٣ ثوانٍ وtry/catch مستقل فلا يؤخّر
  أحدها الآخر ولا يُفشله). تستعملها أيضاً 001/T024 (تسجيل المعلّم عن
  الطالب) و002/T029 (نتيجة الطابور) فلا يتكرّر السلوك بثلاثة مسارات.
*/

/** قرار معلّم على ورد — الإخطار يجدَّل بعد إرجاع الرد، وفشله لا يمسّ النتيجة */
export type WardDecision = {
  halaqahId: number;
  studentId: string;
  wardId: number;
  /** «اطّلع» (seen) ليس قراراً — لا يُمرَّر هنا أصلاً */
  status: Extract<WardStatus, "approved" | "needs_revision">;
  /** ملاحظة المعلّم — نص الإخطار عند طلب الإعادة */
  note?: string;
};

export function notifyWardDecision(decision: WardDecision): void {
  const { halaqahId, studentId, wardId, status, note } = decision;
  const notifyPayload = {
    title: status === "approved" ? "تم اعتماد وردك ✅" : "وردك يحتاج مراجعة",
    body: status === "approved" ? "أحسنت! معلّمك اعتمد وردك." : note ?? "",
    url: "/student",
    tag: "ward-status",
  };
  // after() (لا promise معلّق بلا await، يضيع لو أنهى Vercel الدالة فور
  // إرسال الرد) يجدول الإرسال بعد إرجاع الرد — Next يبقي الدالة حيّة له.
  after(async () => {
    try {
      await Promise.race([
        sendPushToStudent(halaqahId, studentId, notifyPayload),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // فشل الإشعار لا يغيّر نتيجة الاعتماد أبداً — الرد أُرسل مسبقاً بالفعل
    }
    // STEP 61: أولياء الأمور المرتبطون بالطالب — بمحاولة وسقف ٣ ثوانٍ مستقلَّين
    // عن إشعار الطالب أعلاه، فلا يؤخّر أحدهما الآخر ولا يُفشله
    try {
      await Promise.race([
        sendPushToParentsOfStudent(halaqahId, studentId, status),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // نفس مبدأ الطالب: فشل إشعار الولي لا يؤثر على شيء
    }
    // B1: واتساب لأولياء الأمور — بوابة الميزة والموافقة والسقف داخل المُرسِل،
    // فلا شيء يحدث البتة لجامع لم يفعّل «إشعارات واتساب»
    try {
      await Promise.race([
        sendWhatsappToParentsOfStudent({
          halaqahId,
          studentId,
          template: status === "approved" ? "ward_approved" : "ward_needs_revision",
          paramsFor: (studentName) => ({ student_name: studentName }),
          refPrefix: `ward:${wardId}:${status}`,
        }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // نفس مبدأ الويب بوش — فشل واتساب لا يؤثر على شيء
    }
  });
}

/** حمولة حدثَي ورد أُنشئ معتمداً — نفس شكل حمولتي مسارَي الطالب والمعلّم */
export type ApprovedWardEventsLog = { date: string; hifzAyah: AyahRange | null; reviewAyah: AyahRange | null };

/**
 * أحداث ورد أُنشئ معتمداً ابتداءً (تسجيل المعلّم للابتدائي ونتيجة الطابور):
 * يُصدر progress.recorded ثم progress.approved — الورد الواحد يمرّ
 * بالحدثين معاً بلا اعتماد مسبق، فلا تفقد التكاملات نصف الأثر.
 */
export async function emitApprovedWardEvents(input: {
  halaqahId: number;
  studentId: string;
  wardId: number;
  log: ApprovedWardEventsLog;
}): Promise<void> {
  await emitHalaqahEvent(
    input.halaqahId,
    "progress.recorded",
    progressRecordedPayload(input.wardId, input.halaqahId, input.studentId, input.log),
  );
  await emitHalaqahEvent(
    input.halaqahId,
    "progress.approved",
    progressApprovedPayload(input.wardId, input.halaqahId, input.studentId, input.log),
  );
}
