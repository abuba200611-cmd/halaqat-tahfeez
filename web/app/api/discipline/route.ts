import { after } from "next/server";
import { currentTeacher, unauthorized } from "@/lib/auth";
import {
  disciplineContextForHalaqah,
  listActiveSuspensions,
  listHalaqahEvents,
  listHalaqahStudentsBasic,
  restoreExpiredSuspensions,
  runAbsenceLadder,
} from "@/lib/discipline-db";
import { notifyParentsOfLadderEvents } from "@/lib/discipline-notify";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { logServerError } from "@/lib/dev-error-log";

/*
  A2 — الانضباط والمتابعة لمعلّمي الحلقة (المشرف والمساعدون بصلاحية
  متطابقة). الحلقة من الجلسة فقط. الفحص الكسول هنا: فتح الصفحة ينفّذ
  استرجاع الإيقافات المنتهية ثم حساب سُلّم الغياب — لا cron إطلاقاً.
*/

const FEATURE_OFF = () => Response.json({ error: "الانضباط والمتابعة غير مفعّل لهذا الجامع" }, { status: 404 });

/** صفحة الانضباط: فحص كسول (استرجاع + سُلّم) ثم الأحداث والطلاب والإيقافات */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const ctx = await disciplineContextForHalaqah(teacher.halaqahId);
  if (!ctx) return FEATURE_OFF();

  try {
    await restoreExpiredSuspensions({ halaqahId: teacher.halaqahId });
    const inserted = await runAbsenceLadder(teacher.halaqahId, riyadhTodayISO(), ctx.config);

    const [events, students, suspensions] = await Promise.all([
      listHalaqahEvents(teacher.halaqahId),
      listHalaqahStudentsBasic(teacher.halaqahId),
      listActiveSuspensions({ halaqahId: teacher.halaqahId }),
    ]);

    if (inserted.length > 0) {
      after(async () => {
        try {
          await Promise.race([
            notifyParentsOfLadderEvents(teacher.halaqahId, inserted),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        } catch {
          // لا شيء — الإشعار لا يعطّل الصفحة
        }
      });
    }

    return Response.json({
      config: ctx.config,
      mosqueName: ctx.mosqueName,
      halaqahName: teacher.halaqahName,
      events,
      students,
      suspensions,
    });
  } catch (error) {
    await logServerError("discipline:get", error);
    throw error;
  }
}
