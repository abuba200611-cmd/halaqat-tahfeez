import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  RECITATION_MAX_REQUEST_BYTES,
  RECITATIONS_PER_DAY,
  validateAudioBytes,
  validateDuration,
  validateRecitationRange,
} from "@/lib/recitations";
import { insertRecitation, listStudentRecitations } from "@/lib/recitations-db";

/*
  STEP 64 — تلاوات الطالب. halaqahId وstudentId من جلسة currentStudent()
  حصراً — أي قيمة بهذين الاسمين بالـFormData تُتجاهَل ولا تُقرأ إطلاقاً.
*/

async function readLimitedFormData(request: Request): Promise<FormData | "too-large" | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > RECITATION_MAX_REQUEST_BYTES) {
        await reader.cancel().catch(() => {});
        return "too-large";
      }
      chunks.push(value);
    }
    const contentType = request.headers.get("content-type") ?? "";
    return await new Response(new Blob(chunks as BlobPart[]), { headers: { "content-type": contentType } }).formData();
  } catch {
    return null;
  }
}

const bad = (error: string, status = 400) => Response.json({ error }, { status });

/** تلاوات الطالب نفسه (بلا بايتات الصوت) */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();
  return Response.json({ recitations: await listStudentRecitations(student.teacherId, student.id) });
}

/** رفع تلاوة: FormData { audio, surah, fromAyah, toAyah, durationSec } */
export async function POST(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  // فحص رخيص قبل قراءة الجسم (نفس نمط isRequestTooLarge للصور)
  const len = Number(request.headers.get("content-length"));
  if (Number.isFinite(len) && len > RECITATION_MAX_REQUEST_BYTES) return bad("حجم التلاوة أكبر من 3 ميغابايت", 413);

  // الجسم يُقرأ مجزّأً بسقف صارم: لو غاب Content-Length (chunked) أو كُذب فيه لا يُحمَّل أكثر من الحد بالذاكرة
  const formData = await readLimitedFormData(request);
  if (formData === "too-large") return bad("حجم التلاوة أكبر من 3 ميغابايت", 413);
  if (!formData) return bad("طلب غير صحيح");

  const range = validateRecitationRange(formData.get("surah"), formData.get("fromAyah"), formData.get("toAyah"));
  if (!range.ok) return bad(range.error);

  const duration = validateDuration(formData.get("durationSec"));
  if (!duration.ok) return bad(duration.error);

  const file = formData.get("audio");
  if (!(file instanceof File) || file.size === 0) return bad("سجّل تلاوة أو ارفع ملفاً صوتياً أولاً");
  if (file.size > RECITATION_MAX_REQUEST_BYTES) return bad("حجم التلاوة أكبر من 3 ميغابايت", 413);

  const bytes = Buffer.from(await file.arrayBuffer());
  // الفحص الحقيقي على البايتات (لا على file.type وحده): الحجم + الصيغة + تطابق النوع المُعلَن
  const audio = validateAudioBytes(bytes, file.type);
  if (!audio.ok) return bad(audio.error, audio.error.includes("3 ميغابايت") ? 413 : 400);

  if (!(await checkRateLimit(`recitation:${student.teacherId}:${student.id}`, RECITATIONS_PER_DAY, 86400))) {
    return Response.json({ error: "وصلت الحد اليومي للتلاوات (10) — حاول غداً" }, { status: 429 });
  }

  const id = await insertRecitation({
    halaqahId: student.teacherId,
    studentId: student.id,
    range: range.range,
    mime: audio.mime,
    durationSec: duration.seconds,
    bytes,
  });
  if (id === null) return bad("تعذّر الحفظ", 404);

  return Response.json({ ok: true, id });
}
