import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { emitHalaqahEvent } from "@/lib/webhooks-db";
import { attendanceRecordedPayload } from "@/lib/webhooks";
import { recordQrCheckin } from "@/lib/attendance-db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { checkinSecret, qrAttendanceEnabledForHalaqah } from "@/lib/qr-checkin-db";
import { CHECKIN_FAILURE_MESSAGE, verifyCheckinToken } from "@/lib/qr-checkin";
import { ATTENDANCE_LABEL } from "@/lib/attendance";
import { logServerError } from "@/lib/dev-error-log";

/*
  الطالب يمسح رمز حلقته فيُسجَّل حاضراً اليوم. هوية الطالب وحلقته من جلسته
  فقط؛ الرمز لا يُثبت إلا أنه صادر عن الخادم لحلقة ويوم ونافذة — والحلقة
  المقارَنة هي حلقة الطالب، فرمز حلقة أخرى مرفوض. التسجيل متكرر الأمان:
  مسح ثانٍ أو بعد قرار المعلّم لا يغيّر شيئاً ويُرجَع الحالة القائمة.
*/
export async function POST(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  // ٢٠ محاولة كل ١٠ دقائق لكل طالب: يكبح تخمين الرموز دون مسّ استعمال شرعي
  if (!(await checkRateLimit(`qr-checkin:${student.teacherId}:${student.id}`, 20, 600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { t?: unknown };

  try {
    if (!(await qrAttendanceEnabledForHalaqah(student.teacherId))) {
      return Response.json({ error: "الحضور بالرمز غير مفعّل لحلقتك" }, { status: 404 });
    }

    const today = riyadhTodayISO();
    const verdict = verifyCheckinToken(await checkinSecret(), body.t, {
      halaqahId: student.teacherId,
      today,
      nowMs: Date.now(),
    });
    if (!verdict.ok) {
      const status = verdict.reason === "wrong_halaqah" ? 403 : 400;
      return Response.json({ error: CHECKIN_FAILURE_MESSAGE[verdict.reason], reason: verdict.reason }, { status });
    }

    const result = await recordQrCheckin(student.teacherId, student.id, today);
    if (!result.found) return Response.json({ error: "تعذّر تسجيل حضورك" }, { status: 404 });
    if (!result.alreadyRecorded) {
      await emitHalaqahEvent(
        student.teacherId,
        "attendance.recorded",
        attendanceRecordedPayload(student.teacherId, today, [{ studentId: student.id, status: result.status }]),
      );
    }

    return Response.json({
      ok: true,
      alreadyRecorded: result.alreadyRecorded,
      status: result.status,
      statusLabel: ATTENDANCE_LABEL[result.status],
      date: today,
    });
  } catch (error) {
    await logServerError("student-checkin:post", error);
    throw error;
  }
}
