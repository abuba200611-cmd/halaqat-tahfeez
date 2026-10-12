import { after } from "next/server";
import { currentTeacher, unauthorized } from "@/lib/auth";
import { sendPushToParentsOfRecitation, sendPushToStudent } from "@/lib/push";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { normalizeTeacherNote, validateScore } from "@/lib/recitations";
import { reviewRecitation } from "@/lib/recitations-db";

/*
  STEP 64 — تقييم تلاوة: { score: 1..10, note? }. الحلقة من جلسة المعلّم، فتلاوة
  حلقة أخرى ترجع 404 دون كتابة (الشرط داخل UPDATE نفسه).
*/

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`recitation-review:${teacher.id}`, 300, 3600))) return rateLimited();

  const { id } = await params;
  const recitationId = Number(id);
  if (!Number.isInteger(recitationId) || recitationId < 1) return bad("غير موجود", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const score = validateScore(body.score);
  if (!score.ok) return bad(score.error);
  const note = normalizeTeacherNote(body.note);
  if (!note.ok) return bad(note.error);

  const result = await reviewRecitation(teacher.halaqahId, recitationId, score.score, note.note, teacher.id);
  if (!result.found) return bad("غير موجود", 404);

  // إشعار الطالب وأولياء أمره عند أول تقييم فقط — بعد إرجاع الرد وبسقف ٣ ثوانٍ لكلٍّ منهما،
  // فلا يؤخّر الإشعار الحفظ ولا يُفشله (نفس نمط اعتماد الورد)
  if (result.wasPending) {
    const { halaqahId } = teacher;
    const { studentId } = result;
    const scoreValue = score.score;
    after(async () => {
      try {
        await Promise.race([
          sendPushToStudent(halaqahId, studentId, {
            title: "تم تقييم تلاوتك",
            body: `الدرجة: ${scoreValue} من 10.`,
            url: "/student/recitations",
            tag: "recitation-review",
          }),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // فشل الإشعار لا يغيّر نتيجة التقييم — الرد أُرسل مسبقاً
      }
      try {
        await Promise.race([
          sendPushToParentsOfRecitation(halaqahId, studentId, scoreValue),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // نفس المبدأ لأولياء الأمر
      }
    });
  }

  return Response.json({ ok: true });
}
