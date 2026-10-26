import { currentTeacher, unauthorized } from "@/lib/auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import {
  createApprovedWardLog,
  getActiveStudentInHalaqah,
  listSameDayWardStubs,
  listStudentsWithTodayWard,
} from "@/lib/db";
import { getHalaqahStage } from "@/lib/halaqah-stage-db";
import { profileFor } from "@/lib/halaqah-stage";
import { canTeacherRecord, findSameDayDuplicate, MAX_BACKDATE_DAYS } from "@/lib/ward-policy";
import { wholeSurahRange, formatWardByUnit } from "@/lib/ward-units";
import { buildLog, parseRange, parseReviewBody } from "@/lib/ward-log-body";
import { emitApprovedWardEvents, notifyWardDecision } from "@/lib/ward-notify";
import { pageRangeOfAyahRange, SURAH_COUNT } from "@/lib/quran-surahs";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { logServerError } from "@/lib/dev-error-log";

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * المعلّم (مشرف أو مساعد) يسجّل ورداً عن طالب في حلقة ابتدائي (001 US2،
 * FR-003): يُحفظ معتمداً باسم المعلّم في معاملة واحدة، مع أحداث
 * progress.recorded/approved وإخطار الطالب وولي الأمر، وnextStudentId
 * للتتابع السريع (FR-004). الحلقة من الجلسة حصراً؛ التسجيل عن الطالب
 * متاح للابتدائي فقط، وحارس التكرار اليومي يحمي من الازدواج (FR-005).
 */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const stage = await getHalaqahStage(teacher.halaqahId);
  const profile = profileFor(stage);
  if (!canTeacherRecord(profile)) {
    return Response.json(
      { code: "STAGE_NOT_PRIMARY", error: "تسجيل الورد عن الطالب متاح لحلقات الابتدائي فقط" },
      { status: 403 },
    );
  }

  // سقف تسجيل سخي للمعلّم المسرِع: ٣٠٠ ورداً بالساعة يكبح الإساءة فقط
  if (!(await checkRateLimit(`teacher-ward:${teacher.id}`, 300, 3600))) return rateLimited();

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const studentId = String(body.studentId ?? "").trim();
    if (!studentId) throw new Error("معرّف الطالب مفقود");

    // التاريخ: افتراضي اليوم بتوقيت الرياض — لا مستقبل ولا رجوع أكثر من ٣ أيام
    const today = riyadhTodayISO();
    const date = body.date == null || body.date === "" ? today : String(body.date).trim();
    if (!isValidDate(date)) throw new Error("تاريخ غير صحيح");
    const backDays = Math.floor((Date.parse(today) - Date.parse(date)) / 86400000);
    if (backDays < 0) throw new Error("لا يمكن التسجيل لتاريخ مستقبلي");
    if (backDays > MAX_BACKDATE_DAYS) throw new Error("الرجوع بالتاريخ محدود ب٣ أيام");

    // الحفظ: نطاق سورة/آية أو «سورة كاملة» — لا يجتمعان
    const hasHifz = body.hifz != null;
    const hasWholeSurah = body.wholeSurah != null;
    if (hasHifz && hasWholeSurah) throw new Error("اختر نطاق آيات أو سورة كاملة، لا الاثنين معاً");
    let hifz: ReturnType<typeof parseRange>;
    if (hasWholeSurah) {
      const surah = Number(body.wholeSurah);
      if (!Number.isInteger(surah) || surah < 1 || surah > SURAH_COUNT) throw new Error("سورة غير صحيحة");
      const ayah = wholeSurahRange(surah);
      hifz = { ayah, pages: pageRangeOfAyahRange(ayah.fromSurah, ayah.fromAyah, ayah.toSurah, ayah.toAyah) };
    } else {
      hifz = parseRange(body.hifz, "الحفظ");
    }

    const review = parseReviewBody(body.review);
    const note = String(body.note ?? "").trim().slice(0, 500);
    if (!hifz && !review && !note) {
      throw new Error("سجّل حفظاً أو مراجعة قبل الإرسال");
    }

    // الطالب: فعّال غير محذوف بحلقة المعلّم حصراً — الشرط كله داخل الاستعلام
    const student = await getActiveStudentInHalaqah(teacher.halaqahId, studentId);
    if (!student) return Response.json({ error: "الطالب غير موجود في حلقتك" }, { status: 404 });

    // حارس التكرار اليومي (FR-005): أي ورد قائم ذلك اليوم يُحتمل تكراراً —
    // التأكيد الصريح confirmDuplicate هو طريق الدمج المتعمَّد
    const sameDay = await listSameDayWardStubs(teacher.halaqahId, studentId, date);
    const duplicate = findSameDayDuplicate(sameDay, { date, via: "teacher" });
    if (duplicate && body.confirmDuplicate !== true) {
      return Response.json(
        {
          code: "DUPLICATE_TODAY",
          error: "سُجِّل ورد لهذا الطالب في هذا اليوم بالفعل",
          existing: {
            id: duplicate.id,
            recordedVia: duplicate.recordedVia,
            status: duplicate.status,
            summary: formatWardByUnit(profile.unit, duplicate.hifz, duplicate.hifzAyah) ?? "ورد",
          },
        },
        { status: 409 },
      );
    }

    const log = buildLog(date, hifz, review, null, note, null);
    const { id } = await createApprovedWardLog(teacher.halaqahId, studentId, log, {
      recordedVia: "teacher",
      recordedByTeacherId: teacher.id,
    });

    // أحداث الويب هوك (recorded ثم approved داخل الدالة) ثم إخطار القرار —
    // الإخطار يُجدوَل بعد الرد ولا يُفشل النتيجة أبداً
    await emitApprovedWardEvents({ halaqahId: teacher.halaqahId, studentId, wardId: id, log });
    notifyWardDecision({ halaqahId: teacher.halaqahId, studentId, wardId: id, status: "approved" });

    // التتابع (FR-004): أول طالب بعده بلا ورد اليوم — بلا عودة للرئيسية
    const roster = await listStudentsWithTodayWard(teacher.halaqahId, today);
    const next = roster.find((s) => s.id !== studentId && !s.todayWard) ?? null;

    return Response.json({ ok: true, id, status: "approved", nextStudentId: next?.id ?? null });
  } catch (error) {
    await logServerError("teacher-wards:post", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر تسجيل الورد" },
      { status: 400 },
    );
  }
}
