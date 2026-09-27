import { after } from "next/server";
import { currentStudent, currentTeacher, studentUnauthorized, unauthorized } from "@/lib/auth";
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
import { parseAyahRange, parseReviewSegments, type AyahRangeInput } from "@/lib/ward-ayah";
import type { WardStatus } from "@/lib/types";

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

/** يبني NewWardLog من نتيجتَي تحقّق الحفظ والمراجعة — مشترك بين POST وPUT */
function buildLog(
  date: string,
  hifz: ReturnType<typeof parseAyahRange>,
  review: ReturnType<typeof parseReviewSegments>,
  note: string,
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
    note,
  };
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** الطالب يرسل ورد اليوم — حفظه (نطاق واحد) ومراجعته (١ إلى ١٠ مقاطع، STEP 52) */
export async function POST(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const hifz = parseRange(body.hifz, "الحفظ");
    const review = parseReviewBody(body.review);
    const note = String(body.note ?? "").trim().slice(0, 500);

    if (!hifz && !review && !note) {
      throw new Error("سجّل حفظاً أو مراجعة قبل الإرسال");
    }

    const log = buildLog(new Date().toISOString().slice(0, 10), hifz, review, note);
    const { previousAttemptId } = await createWardLog(student.teacherId, student.id, log);

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

    return Response.json({ ok: true });
  } catch (error) {
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
    const note = String(body.note ?? "").trim().slice(0, 500);

    if (!hifz && !review && !note) {
      throw new Error("سجّل حفظاً أو مراجعة قبل الحفظ");
    }

    const log = buildLog(date, hifz, review, note);
    const ok = await updateWardLog(student.teacherId, student.id, id, log);
    if (!ok) {
      return Response.json(
        { error: "لا يمكن تعديل هذا الورد — إمّا اعتمده معلّمك بالفعل أو ليس ملكك" },
        { status: 403 },
      );
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

/** وارد المعلّم: قائمة الأوراد وعدد الجديد منها */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const onlyNew = new URL(request.url).searchParams.get("new") === "1";
  return Response.json({
    wards: await listWardLogs(teacher.halaqahId, onlyNew),
    newCount: await countNewWards(teacher.halaqahId),
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

  let result: { studentId: string } | null;
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

  // إشعار فوري للطالب عند قرار المعلّم — لا عند "اطّلع" (seen)، فذاك
  // ليس قراراً بعد. after() (لا promise معلّق بلا await، يضيع لو أنهى
  // Vercel الدالة فور إرسال الرد) يجدول الإرسال بعد إرجاع الرد — Next
  // يبقي الدالة حيّة له. سقف ٣ ثوانٍ + try/catch يضمنان ألا يؤثر فشل أو
  // تعليق الإشعار على نتيجة الاعتماد بأي حال (اطمئنان إضافي فوق كون
  // sendPushToStudent نفسها لا ترمي أصلاً لكل اشتراك على حدة).
  if (status === "approved" || status === "needs_revision") {
    const notifyPayload = {
      title: status === "approved" ? "تم اعتماد وردك ✅" : "وردك يحتاج مراجعة",
      body: status === "approved" ? "أحسنت! معلّمك اعتمد وردك." : note ?? "",
      url: "/student",
      tag: "ward-status",
    };
    after(async () => {
      try {
        await Promise.race([
          sendPushToStudent(teacher.halaqahId, result.studentId, notifyPayload),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // فشل الإشعار لا يغيّر نتيجة الاعتماد أبداً — الرد أُرسل مسبقاً بالفعل
      }
    });
  }

  return Response.json({ ok: true, newCount: await countNewWards(teacher.halaqahId) });
}
