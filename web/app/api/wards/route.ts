import { currentStudent, currentTeacher, studentUnauthorized, unauthorized } from "@/lib/auth";
import {
  countNewWards,
  createWardLog,
  listWardLogs,
  setWardLogStatus,
  type NewWardLog,
} from "@/lib/db";
import { sendPushToTeacher } from "@/lib/push";
import { TOTAL_PAGES } from "@/lib/quran";
import type { WardStatus } from "@/lib/types";

/** يقرأ نطاق صفحات اختيارياً من الجسم؛ null إن لم يُرسل، أو يرمي إن كان ناقصاً/خارج الحدود */
function parseRange(
  input: unknown,
  label: string,
): { from: number; to: number } | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object") throw new Error(`نطاق ${label} غير صحيح`);
  const raw = input as Record<string, unknown>;
  if (raw.from === undefined && raw.to === undefined) return null;

  const from = Number(raw.from);
  const to = Number(raw.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) throw new Error(`نطاق ${label} غير صحيح`);
  if (from < 1 || to > TOTAL_PAGES || from > to) {
    throw new Error(`نطاق ${label} خارج حدود المصحف`);
  }
  return { from, to };
}

/** الطالب يرسل ورد اليوم — حفظه ومراجعته */
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
      hifzFrom: hifz?.from ?? null,
      hifzTo: hifz?.to ?? null,
      reviewFrom: review?.from ?? null,
      reviewTo: review?.to ?? null,
      note,
    };
    createWardLog(student.teacherId, student.id, log);

    // إشعار المعلّم — لا يُفشل الحفظ إن تعذّر
    const parts: string[] = [];
    if (hifz) parts.push(`حفظ ${hifz.from}–${hifz.to}`);
    if (review) parts.push(`مراجعة ${review.from}–${review.to}`);
    await sendPushToTeacher(student.teacherId, {
      title: "أنجز طالب ورده",
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
    wards: listWardLogs(teacher.id, onlyNew),
    newCount: countNewWards(teacher.id),
  });
}

/** المعلّم يغيّر حالة ورد: اطّلاع أو اعتماد */
export async function PATCH(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
  const id = Number(body.id);
  const status = String(body.status ?? "") as WardStatus;
  if (!Number.isInteger(id)) return Response.json({ error: "معرّف الورد مفقود" }, { status: 400 });
  if (status !== "seen" && status !== "approved") {
    return Response.json({ error: "حالة غير صحيحة" }, { status: 400 });
  }

  if (!setWardLogStatus(teacher.id, id, status)) {
    return Response.json({ error: "الورد غير موجود" }, { status: 404 });
  }
  return Response.json({ ok: true, newCount: countNewWards(teacher.id) });
}
