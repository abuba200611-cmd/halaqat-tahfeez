import { currentStudent, currentTeacher, studentUnauthorized, unauthorized } from "@/lib/auth";
import {
  countNewWards,
  createWardLog,
  listWardLogs,
  setWardLogStatus,
  type NewWardLog,
} from "@/lib/db";
import { sendPushToHalaqah } from "@/lib/push";
import { parseAyahRange, type AyahRangeInput } from "@/lib/ward-ayah";
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

/** يقرأ نطاق سورة/آية اختياري من الجسم ويحوّله لنطاق صفحات — يرمي برسالة دقيقة لو غير صحيح */
function parseRange(input: unknown, label: string) {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") throw new Error(`أكمل اختيار السورة والآية بقسم ${label}`);
  const raw = input as { from?: unknown; to?: unknown };
  const range: AyahRangeInput = { from: readPos(raw.from), to: readPos(raw.to) };
  return parseAyahRange(range, label);
}

/** الطالب يرسل ورد اليوم — حفظه ومراجعته، بالسورة والآية (STEP 49) */
export async function POST(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const hifz = parseRange(body.hifz, "الحفظ");
    const review = parseRange(body.review, "المراجعة");
    const note = String(body.note ?? "").trim().slice(0, 500);

    if (!hifz && !review && !note) {
      throw new Error("سجّل حفظاً أو مراجعة قبل الإرسال");
    }

    const log: NewWardLog = {
      date: new Date().toISOString().slice(0, 10),
      hifzFrom: hifz?.pages.from ?? null,
      hifzTo: hifz?.pages.to ?? null,
      reviewFrom: review?.pages.from ?? null,
      reviewTo: review?.pages.to ?? null,
      hifzAyah: hifz?.ayah ?? null,
      reviewAyah: review?.ayah ?? null,
      note,
    };
    const { previousAttemptId } = await createWardLog(student.teacherId, student.id, log);

    // إشعار المعلّم — لا يُفشل الحفظ إن تعذّر. عنوان مختلف لو كانت هذي
    // إعادة إرسال بعد "طلب إعادة" سابق (previousAttemptId من الخادم نفسه)
    // — نفس آلية sendPushToHalaqah الموجودة، بلا أي بنية إشعار جديدة.
    const parts: string[] = [];
    if (hifz) parts.push(`حفظ ${hifz.pages.from}–${hifz.pages.to}`);
    if (review) parts.push(`مراجعة ${review.pages.from}–${review.pages.to}`);
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

  try {
    if (!(await setWardLogStatus(teacher.halaqahId, id, status, teacher.id, note))) {
      return Response.json({ error: "الورد غير موجود أو لا يمكن تعديله" }, { status: 404 });
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر تحديث حالة الورد" },
      { status: 400 },
    );
  }
  return Response.json({ ok: true, newCount: await countNewWards(teacher.halaqahId) });
}
