import { after } from "next/server";
import { sendPushToStudent, sendPushToTeacher, sendPushToParentsOfExam } from "@/lib/push";
import { sendWhatsappToParentsOfStudent } from "@/lib/notify/outbox";
import type { ResultView } from "@/lib/mosque/exams-db";
import { juzRangeLabel } from "@/lib/mosque/exams";

/*
  إشعارات نشر نتيجة اختبار — الطالب وولي أمره والمعلّم المرشِّح، كلٌّ بعد
  إرجاع الرد وبسقف ٣ ثوانٍ (نمط اعتماد الورد وتقييم التلاوة): فشل الإشعار
  أو بطؤه لا يؤخّر النشر ولا يُفشله.
*/

function notify(result: ResultView): void {
  const examName = `${result.typeName} (${juzRangeLabel(result.juzFrom, result.juzTo)})`;
  const studentText = `نتيجة ${examName}: ${result.score} من ${result.maxScore} — ${result.passed ? "ناجح 🎉" : "لم يُجتز"}`;

  after(async () => {
    try {
      await Promise.race([
        sendPushToStudent(result.halaqahId, result.studentId, {
          title: "نتيجة اختبارك",
          body: studentText,
          url: "/student/exams",
          tag: `exam-result-${result.id}`,
        }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // فشل الإشعار لا يغيّر النتيجة — الرد أُرسل مسبقاً
    }
    try {
      await Promise.race([
        sendPushToParentsOfExam(result.halaqahId, result.studentId, examName, result.passed),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // نفس المبدأ لأولياء الأمر
    }
    // B1: واتساب لأولياء الأمر — الدرجة والتفاصيل تبقى بالتطبيق، الرسالة تحمل
    // الاسم والاختبار والنتيجة فقط؛ البوابة والموافقة والسقف داخل المُرسِل
    try {
      await Promise.race([
        sendWhatsappToParentsOfStudent({
          halaqahId: result.halaqahId,
          studentId: result.studentId,
          mosqueId: result.mosqueId,
          template: "exam_result",
          paramsFor: (studentName) => ({
            student_name: studentName,
            exam_name: examName,
            result: result.passed ? "ناجح" : "لم يُجتز",
          }),
          refPrefix: `exam:${result.id}`,
        }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // ونفسه لواتساب
    }
    try {
      await Promise.race([
        sendPushToTeacher(result.nominatedBy, {
          title: "نُشرت نتيجة اختبار",
          body: `${result.studentName} — ${examName}: ${result.passed ? "ناجح" : "لم يُجتز"}.`,
          url: "/exams",
          tag: `exam-published-${result.id}`,
        }),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
    } catch {
      // ونفسه للمعلّم المرشِّح
    }
  });
}

/**
 * يشعِر بنشر نتيجة إن كانت أول نشر — إعادة النشر بعد سحب أو النشر المتأخر
 * للمسوّدة نفسها لا تُكرَّر مزعجةً؛ أول نشر فقط يُشعِر.
 */
export function notifyExamPublished(firstPublish: boolean, result: ResultView): void {
  if (firstPublish) notify(result);
}
