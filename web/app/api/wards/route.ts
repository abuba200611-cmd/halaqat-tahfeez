import { after } from "next/server";
import { emitHalaqahEvent } from "@/lib/webhooks-db";
import { progressApprovedPayload, progressRecordedPayload } from "@/lib/webhooks";
import { currentStudent, currentTeacher, studentUnauthorized, unauthorized } from "@/lib/auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import {
  countNewWards,
  createWardLog,
  deleteWardLog,
  listWardLogs,
  setWardLogStatus,
  updateWardLog,
  type NewReviewSegment,
  type NewWardLog,
} from "@/lib/db";
import { sendPushToHalaqah, sendPushToStudent } from "@/lib/push";
import { reviewTrackConfigForHalaqah } from "@/lib/mosque/review-tracks-db";
import { parseAyahRange, parseReviewSegments, type AyahRangeInput } from "@/lib/ward-ayah";
import { parseReviewTracks } from "@/lib/review-tracks";
import { notifyWardDecision } from "@/lib/ward-notify";
import { logServerError } from "@/lib/dev-error-log";
import type { ReviewTrack, WardStatus } from "@/lib/types";

/** يقرأ موضع سورة/آية من الجسم بأمان — null لأي قيمة غير رقمية */
function readPos(input: unknown): { surah: number | null; ayah: number | null } {
  const raw = (input ?? {}) as Record<string, unknown>;
  const surah = Number(raw.surah);
  const ayah = Number(raw.ayah);
  return {
    surah: Number.isFinite(surah) && raw.surah != null ? surah : null,
    ayah: Number.isFinite(ayah) && raw.ayah != null ? ayah : null,
  };
}

function readRangeInput(raw: unknown): AyahRangeInput {
  const r = (raw ?? {}) as { from?: unknown; to?: unknown };
  return { from: readPos(r.from), to: readPos(r.to) };
}

/** يقرأ نطاق سورة/آية اختياري (الحفظ) من الجسم ويحوّله لنطاق صفحات — يرمي برسالة دقيقة لو غير صحيح */
function parseRange(input: unknown, label: string) {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") throw new Error(`أكمل اختيار السورة والآية بقسم ${label}`);
  return parseAyahRange(readRangeInput(input), label);
}

/**
 * يقرأ قائمة مقاطع المراجعة من الجسم (STEP 52: مصفوفة من ١ إلى ١٠
 * مقاطع، كل مقطع {from, to}) ويتحقّق منها عبر parseReviewSegments —
 * نفس مصدر الحقيقة الذي تستخدمه الواجهة للتحقّق الفوري.
 */
function parseReviewBody(input: unknown): ReturnType<typeof parseReviewSegments> {
  if (input === null || input === undefined) return null;
  if (!Array.isArray(input)) throw new Error("صيغة المراجعة غير صحيحة");
  return parseReviewSegments(input.map(readRangeInput));
}

/** يقرأ معرّف زميل المراجعة الاختياري من الجسم — نص غير فارغ فقط، وإلا null (STEP 56) */
function readBuddyId(input: unknown): string | null {
  const value = String(input ?? "").trim();
  return value || null;
}

/** يبني NewWardLog من نتيجتَي تحقّق الحفظ والمراجعة — مشترك بين POST وPUT */
function buildLog(
  date: string,
  hifz: ReturnType<typeof parseAyahRange>,
  review: ReturnType<typeof parseReviewSegments>,
  reviewTracks: (ReviewTrack | null)[] | null,
  note: string,
  buddyStudentId: string | null,
): NewWardLog {
  const reviewSegments: NewReviewSegment[] | null = review
    ? review.segments.map((seg, i) => ({ ...seg, fromPage: review.pages[i].from, toPage: review.pages[i].to }))
    : null;
  const reviewFrom = review ? Math.min(...review.pages.map((p) => p.from)) : null;
  const reviewTo = review ? Math.max(...review.pages.map((p) => p.to)) : null;

  return {
    date,
    hifzFrom: hifz?.pages.from ?? null,
    hifzTo: hifz?.pages.to ?? null,
    reviewFrom,
    reviewTo,
    hifzAyah: hifz?.ayah ?? null,
    // STEP 52: المراجعة الجديدة دائماً مقاطع (0 أو أكثر)، لا نطاق واحد قديم
    reviewAyah: null,
    reviewSegments,
    // B3: تصنيف كبرى/صغرى لكل مقطع — اختياري، بلا قيمة لأي ورد قديم
    reviewSegmentTracks: reviewTracks ?? undefined,
    note,
    buddyStudentId,
  };
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** الطالب يرسل ورد اليوم — حفظه (نطاق واحد) ومراجعته (١ إلى ١٠ مقاطع، STEP 52) */
export async function POST(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  // سقف إرسال لكل طالب: ٣٠ ورداً بالساعة — يكبح السبام دون المستخدم الشرعي
  if (!(await checkRateLimit(`ward:${student.teacherId}:${student.id}`, 30, 3600))) {
    return rateLimited();
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const hifz = parseRange(body.hifz, "الحفظ");
    const review = parseReviewBody(body.review);
    const reviewTracks = parseReviewTracks(body.reviewTracks, review?.segments.length ?? 0);
    if (!review && reviewTracks) throw new Error("تصنيف المراجعة بلا مقاطع مراجعة");
    const note = String(body.note ?? "").trim().slice(0, 500);
    const buddyStudentId = readBuddyId(body.buddyStudentId);

    if (!hifz && !review && !note) {
      throw new Error("سجّل حفظاً أو مراجعة قبل الإرسال");
    }

    const log = buildLog(new Date().toISOString().slice(0, 10), hifz, review, reviewTracks, note, buddyStudentId);
    const { id: wardLogId, previousAttemptId } = await createWardLog(student.teacherId, student.id, log);
    await emitHalaqahEvent(
      student.teacherId,
      "progress.recorded",
      progressRecordedPayload(wardLogId, student.teacherId, student.id, log),
    );

    // إشعار المعلّم — لا يُفشل الحفظ إن تعذّر. عنوان مختلف لو كانت هذي
    // إعادة إرسال بعد "طلب إعادة" سابق (previousAttemptId من الخادم نفسه)
    // — نفس آلية sendPushToHalaqah الموجودة، بلا أي بنية إشعار جديدة.
    const parts: string[] = [];
    if (hifz) parts.push(`حفظ ${hifz.pages.from}–${hifz.pages.to}`);
    if (review) parts.push(`مراجعة ${review.pagesTotal} صفحة`);
    await sendPushToHalaqah(student.teacherId, {
      title: previousAttemptId ? "أعاد طالب إرسال ورده بعد طلب المراجعة" : "أنجز طالب ورده",
      body: `${student.name}${parts.length ? " · " + parts.join(" · ") : ""}`,
      url: "/inbox",
      tag: "ward",
    });

    // إشعار الزميل بطلب التأكيد (STEP 56) — اختياري، لا يُفشل الحفظ إن
    // تعذّر أو تأخّر. نفس نمط after() + سقف ٣ ثوانٍ المستخدَم بالفعل بـPATCH أدناه.
    if (buddyStudentId) {
      after(async () => {
        try {
          await Promise.race([
            sendPushToStudent(student.teacherId, buddyStudentId, {
              title: "طلب تأكيد مراجعة",
              body: `${student.name} سجّل أنه راجع معك — أكّد؟`,
              url: "/student",
              tag: "buddy-request",
            }),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        } catch {
          // فشل الإشعار لا يغيّر نتيجة إرسال الورد أبداً — الرد أُرسل مسبقاً
        }
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("wards:post", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر إرسال الورد" },
      { status: 400 },
    );
  }
}

/**
 * الطالب يعدّل ورداً سبق إرساله — فقط ما دام لم يتّخذ المعلّم قراراً
 * بعده (new أو seen). الشرط بالكامل داخل استعلام lib/db.ts نفسه، لا هنا
 * — هذا المسار لا يثق بأي شيء غير معرّف الورد من الجسم؛ الملكية (نفس
 * الحلقة والطالب) والقفل يتحقّقان سويّاً بجملة SQL واحدة.
 */
export async function PUT(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id)) throw new Error("معرّف الورد مفقود");

    const date = String(body.date ?? "").trim();
    if (!isValidDate(date)) throw new Error("تاريخ غير صحيح");

    const hifz = parseRange(body.hifz, "الحفظ");
    const review = parseReviewBody(body.review);
    const reviewTracks = parseReviewTracks(body.reviewTracks, review?.segments.length ?? 0);
    if (!review && reviewTracks) throw new Error("تصنيف المراجعة بلا مقاطع مراجعة");
    const note = String(body.note ?? "").trim().slice(0, 500);
    const buddyStudentId = readBuddyId(body.buddyStudentId);

    if (!hifz && !review && !note) {
      throw new Error("سجّل حفظاً أو مراجعة قبل الحفظ");
    }

    const log = buildLog(date, hifz, review, reviewTracks, note, buddyStudentId);
    const result = await updateWardLog(student.teacherId, student.id, id, log);
    if (!result.updated) {
      return Response.json(
        { error: "لا يمكن تعديل هذا الورد — إمّا اعتمده معلّمك بالفعل أو ليس ملكك" },
        { status: 403 },
      );
    }

    // إشعار الزميل مجدداً لو أُعيد طلب تأكيده بخيار الحلقة (تعديل محتوى
    // وردٍ سبق تأكيده/رفضه) — نفس نمط after() + سقف ٣ ثوانٍ أعلاه.
    const resetBuddyId = result.buddyResetTo;
    if (resetBuddyId) {
      after(async () => {
        try {
          await Promise.race([
            sendPushToStudent(student.teacherId, resetBuddyId, {
              title: "طلب تأكيد مراجعة",
              body: `${student.name} عدّل ورده بعد تأكيدك — أكّد المراجعة الجديدة؟`,
              url: "/student",
              tag: "buddy-request",
            }),
            new Promise((resolve) => setTimeout(resolve, 3000)),
          ]);
        } catch {
          // فشل الإشعار لا يغيّر نتيجة التعديل أبداً — الرد أُرسل مسبقاً
        }
      });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر حفظ التعديل" },
      { status: 400 },
    );
  }
}

/** الطالب يحذف ورداً سبق إرساله — نفس شرط القفل والملكية أعلاه بالضبط */
export async function DELETE(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "معرّف الورد مفقود" }, { status: 400 });

  const ok = await deleteWardLog(student.teacherId, student.id, id);
  if (!ok) {
    return Response.json(
      { error: "لا يمكن حذف هذا الورد — إمّا اعتمده معلّمك بالفعل أو ليس ملكك" },
      { status: 403 },
    );
  }
  return Response.json({ ok: true });
}

/** وارد المعلّم: قائمة الأوراد وعدد الجديد منها، مع إعدادات تصنيف المراجعة بحلقته */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const onlyNew = new URL(request.url).searchParams.get("new") === "1";
  return Response.json({
    wards: await listWardLogs(teacher.halaqahId, onlyNew),
    newCount: await countNewWards(teacher.halaqahId),
    reviewTrackConfig: await reviewTrackConfigForHalaqah(teacher.halaqahId),
  });
}

/** المعلّم يغيّر حالة ورد: اطّلاع، اعتماد، أو طلب إعادة (يتطلب ملاحظة) */
export async function PATCH(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    status?: unknown;
    note?: unknown;
  };
  const id = Number(body.id);
  const status = String(body.status ?? "") as WardStatus;
  if (!Number.isInteger(id)) return Response.json({ error: "معرّف الورد مفقود" }, { status: 400 });
  if (status !== "seen" && status !== "approved" && status !== "needs_revision") {
    return Response.json({ error: "حالة غير صحيحة" }, { status: 400 });
  }

  // ملاحظة المراجعة إلزامية فقط عند طلب إعادة — لا تُقرأ ولا تُستخدم لأي حالة أخرى.
  // previous_attempt_id لا يُقرأ من الجسم إطلاقاً بأي حال (يُشتَق داخلياً بالخادم فقط).
  let note: string | undefined;
  if (status === "needs_revision") {
    note = String(body.note ?? "").trim().slice(0, 500);
    if (!note) {
      return Response.json({ error: "اكتب ملاحظة توضّح سبب طلب الإعادة" }, { status: 400 });
    }
  }

  let result: Awaited<ReturnType<typeof setWardLogStatus>>;
  try {
    result = await setWardLogStatus(teacher.halaqahId, id, status, teacher.id, note);
    if (!result) {
      return Response.json({ error: "الورد غير موجود أو لا يمكن تعديله" }, { status: 404 });
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر تحديث حالة الورد" },
      { status: 400 },
    );
  }

  if (status === "approved" && result.log) {
    await emitHalaqahEvent(
      teacher.halaqahId,
      "progress.approved",
      progressApprovedPayload(id, teacher.halaqahId, result.studentId, result.log),
    );
  }

  // إشعار فوري للطالب عند قرار المعلّم — لا عند "اطّلع" (seen)، فذاك
  // ليس قراراً بعد. سقف ٣ ثوانٍ وضمانات عدم التأثير على النتيجة داخل
  // notifyWardDecision نفسها (مستخرَجة من هذا المسار حرفياً، وتستعملها
  // أيضاً تسجيل المعلّم للابتدائي ونتيجة الطابور).
  if (status === "approved" || status === "needs_revision") {
    notifyWardDecision({ halaqahId: teacher.halaqahId, studentId: result.studentId, wardId: id, status, note });
  }

  return Response.json({ ok: true, newCount: await countNewWards(teacher.halaqahId) });
}
