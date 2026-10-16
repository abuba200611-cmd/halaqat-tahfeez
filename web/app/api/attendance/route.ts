import { after } from "next/server";
import { currentTeacher, unauthorized } from "@/lib/auth";
import { getDayAttendanceData, markAllPresent, setAttendance } from "@/lib/attendance-db";
import {
  ATTENDANCE_NOTE_MAX,
  countAttendance,
  isAttendanceStatus,
  isValidAttendanceDate,
  mergeDayAttendance,
} from "@/lib/attendance";
import { sendPushToParentsOfAbsence } from "@/lib/push";
import { disciplineContextForHalaqah, runAbsenceLadder } from "@/lib/discipline-db";
import { notifyParentsOfLadderEvents } from "@/lib/discipline-notify";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { logServerError } from "@/lib/dev-error-log";

/*
  STEP 62 — الحضور اليومي لمعلّمي الحلقة (المشرف والمساعدون بصلاحية
  متطابقة). الحلقة تُؤخذ من الجلسة فقط — لا يقبل أي مسار معرّف حلقة من العميل.
*/

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** يتحقّق من تاريخ الطلب: صيغة صحيحة وليس بالمستقبل (بتوقيت الرياض). يرجع رسالة خطأ أو null */
function dateError(date: unknown, today: string): string | null {
  if (!isValidAttendanceDate(date)) return "تاريخ غير صحيح";
  if (date > today) return "لا يمكن تسجيل حضور ليوم مستقبلي";
  return null;
}

/** حضور يوم: طلاب الحلقة الفعّالون بحالاتهم (المخزَّنة تغلب الضمنية من الورد) وعدّادات اليوم */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const today = riyadhTodayISO();
  const date = new URL(request.url).searchParams.get("date") ?? today;
  const err = dateError(date, today);
  if (err) return bad(err);

  const data = await getDayAttendanceData(teacher.halaqahId, date);
  const rows = mergeDayAttendance(data.students, data.stored, data.wardStudentIds);
  return Response.json({ date, today, rows, counts: countAttendance(rows) });
}

/** يسجّل حالة طالب واحد (حفظ تلقائي عند كل ضغطة) */
export async function PUT(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  // سقف سخيّ: الحفظ التلقائي عند كل ضغطة (٦٠٠/ساعة لكل معلّم) يكبح السبام دون مسّ الاستعمال الشرعي
  if (!(await checkRateLimit(`attendance:${teacher.id}`, 600, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const today = riyadhTodayISO();

  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId) return bad("الطالب مفقود");
  if (!isAttendanceStatus(body.status)) return bad("حالة غير صحيحة");
  const err = dateError(body.date, today);
  if (err) return bad(err);
  const date = body.date as string;

  let note: string | undefined;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return bad("ملاحظة غير صحيحة");
    note = body.note.trim().slice(0, ATTENDANCE_NOTE_MAX);
  }

  // فشل الحفظ يبقى ٥٠٠ كما هو — نسجّله فقط لقسم «الصحة» بالوحة المطوّر
  try {
    const result = await setAttendance(teacher.halaqahId, studentId, date, body.status, note, teacher.id);
    if (!result.found) return bad("طالب غير موجود", 404);

    // إشعار أولياء الأمر عند أول تحويل إلى غائب ليوم اليوم فقط، وحساب سُلّم
    // الغياب (A2) عند أي تسجيل غياب — كلاهما بعد الرد ولا يُفشل الحفظ ولا يؤخّره
    if (body.status === "absent") {
      after(async () => {
        if (result.previous !== "absent" && date === today) {
          try {
            await Promise.race([
              sendPushToParentsOfAbsence(teacher.halaqahId, studentId),
              new Promise((resolve) => setTimeout(resolve, 3000)),
            ]);
          } catch {
            // فشل الإشعار لا يغيّر نتيجة الحفظ — الرد أُرسل مسبقاً
          }
        }
        // سُلّم الغياب: لا شيء لجوامع لم تفعّل الانضباط — فحص الميزة أول شيء
        try {
          const ctx = await disciplineContextForHalaqah(teacher.halaqahId);
          if (ctx) {
            const inserted = await runAbsenceLadder(teacher.halaqahId, today, ctx.config);
            if (inserted.length > 0) await notifyParentsOfLadderEvents(teacher.halaqahId, inserted);
          }
        } catch {
          // فشل حساب السُلّم لا يغيّر نتيجة الحفظ — الفحص الكسول عند فتح الصفحة يكمّله
        }
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("attendance:put", error);
    throw error;
  }
}

/** "تحديد الكل حاضر": حاضر لكل من ليس له قرار صريح فقط — لا يمسّ غائباً/مستأذناً سبق تحديده */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`attendance:${teacher.id}`, 600, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const err = dateError(body.date, riyadhTodayISO());
  if (err) return bad(err);
  if (body.action !== "markAllPresent") return bad("إجراء غير معروف");

  const marked = await markAllPresent(teacher.halaqahId, body.date as string, teacher.id);
  return Response.json({ ok: true, marked });
}
