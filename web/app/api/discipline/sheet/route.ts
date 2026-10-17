import { currentTeacher, unauthorized } from "@/lib/auth";
import { disciplineContextForHalaqah, getMonthlySheetData, reopenSheet, submitSheet } from "@/lib/discipline-db";
import { isValidMonthKey } from "@/lib/hijri";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { logServerError } from "@/lib/dev-error-log";

/*
  A2 — كشف المتابعة الشهري للحلقة: كل الأرقام تُحسب لحظة العرض من جداول
  الحضور والأوراد والخطط والانضباط، والمخزَّن حالة التسليم فقط. المعلّم
  يسلّم الكشف للإدارة ويمكنه فتحه للتعديل ما دام مُسلَّماً (لا بعد المراجعة).
*/

const FEATURE_OFF = () => Response.json({ error: "الانضباط والمتابعة غير مفعّل لهذا الجامع" }, { status: 404 });

/** كشف الشهر: ?month=YYYY-MM (هجري) — الشهر الجاري افتراضياً */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const ctx = await disciplineContextForHalaqah(teacher.halaqahId);
  if (!ctx) return FEATURE_OFF();

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!isValidMonthKey(month)) return Response.json({ error: "شهر غير صحيح" }, { status: 400 });

  try {
    const sheet = await getMonthlySheetData(teacher.halaqahId, month, ctx.config);
    return Response.json({ sheet, halaqahName: teacher.halaqahName, mosqueName: ctx.mosqueName });
  } catch (error) {
    await logServerError("discipline-sheet:get", error);
    throw error;
  }
}

/** تسليم الكشف للإدارة أو فتحه للتعديل: { month, action: submit|reopen, notes? } */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  if (!(await checkRateLimit(`discipline-sheet:${teacher.id}`, 30, 3600))) return rateLimited();

  const ctx = await disciplineContextForHalaqah(teacher.halaqahId);
  if (!ctx) return FEATURE_OFF();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const month = typeof body.month === "string" ? body.month : "";
  if (!isValidMonthKey(month)) return Response.json({ error: "شهر غير صحيح" }, { status: 400 });

  let notes: string | null = null;
  if (body.notes !== undefined && body.notes !== null) {
    if (typeof body.notes !== "string") return Response.json({ error: "ملاحظات غير صحيحة" }, { status: 400 });
    const trimmed = body.notes.trim().slice(0, 500);
    notes = trimmed === "" ? null : trimmed;
  }

  try {
    if (body.action === "submit") {
      await submitSheet({ halaqahId: teacher.halaqahId, month, notes, teacherId: teacher.id });
      return Response.json({ ok: true, status: "submitted" });
    }
    if (body.action === "reopen") {
      const ok = await reopenSheet(teacher.halaqahId, month);
      if (!ok) return Response.json({ error: "لا يمكن فتح كشف مراجَع أو غير مُسلَّم" }, { status: 400 });
      return Response.json({ ok: true, status: "draft" });
    }
    return Response.json({ error: "إجراء غير معروف" }, { status: 400 });
  } catch (error) {
    await logServerError("discipline-sheet:post", error);
    throw error;
  }
}
