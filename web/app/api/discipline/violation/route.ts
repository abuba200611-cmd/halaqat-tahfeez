import { after } from "next/server";
import { currentTeacher, unauthorized } from "@/lib/auth";
import { disciplineContextForHalaqah, recordViolation } from "@/lib/discipline-db";
import { sendPushToParentsOfDiscipline } from "@/lib/push";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { violationStep, DISCIPLINE_NOTE_MAX } from "@/lib/discipline";
import { logServerError } from "@/lib/dev-error-log";

/*
  A2 — تسجيل مخالفة: المعلّم يختار التصنيف، والنظام يحدّد درجة السُلّم
  التالية بعدّ مخالفات الطالب. الدرجة ٥ تنفّذ الإيقاف المؤقت فوراً
  (أيامه من إعدادات الجامع) والدرجة ٤ تُشعر ولي الأمر بعد الرد.
*/

export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  // تسجيل مخالفة حدث نادر — سقف ٦٠/ساعة لكل معلّم يكبح السبام دون مسّ الاستعمال الشرعي
  if (!(await checkRateLimit(`discipline:${teacher.id}`, 60, 3600))) return rateLimited();

  const ctx = await disciplineContextForHalaqah(teacher.halaqahId);
  if (!ctx) return Response.json({ error: "الانضباط والمتابعة غير مفعّل لهذا الجامع" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId) return Response.json({ error: "الطالب مفقود" }, { status: 400 });

  const category = typeof body.category === "string" ? body.category.trim() : "";
  if (!ctx.config.violations.categories.includes(category)) {
    return Response.json({ error: "تصنيف غير معروف" }, { status: 400 });
  }

  let note: string | null = null;
  if (body.note !== undefined && body.note !== null) {
    if (typeof body.note !== "string") return Response.json({ error: "ملاحظة غير صحيحة" }, { status: 400 });
    const trimmed = body.note.trim().slice(0, DISCIPLINE_NOTE_MAX);
    note = trimmed === "" ? null : trimmed;
  }

  try {
    const result = await recordViolation({
      halaqahId: teacher.halaqahId,
      studentId,
      category,
      note,
      createdBy: teacher.id,
      config: ctx.config,
    });
    if (!result.found) return Response.json({ error: "طالب غير موجود" }, { status: 404 });

    // إشعار ولي الأمر عند درجة الإشعار — بعد الرد وبسباق ٣ ثوان، لا يُفشل التسجيل
    if (result.step === 4) {
      after(async () => {
        try {
          await Promise.race([
            sendPushToParentsOfDiscipline(teacher.halaqahId, studentId, "warning"),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        } catch {
          // فشل الإشعار لا يغيّر نتيجة التسجيل
        }
      });
    }

    return Response.json({
      ok: true,
      step: result.step,
      stepLabel: violationStep(result.step).labelAr,
      eventId: result.eventId,
      suspensionUntil: result.suspensionUntil,
    });
  } catch (error) {
    await logServerError("discipline:violation", error);
    throw error;
  }
}
