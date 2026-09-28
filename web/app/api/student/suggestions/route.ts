import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { addStudentSuggestion, checkStudentSuggestionRateLimit, type StudentSuggestionKind } from "@/lib/db";
import { readAndProcessAttachments } from "@/lib/image-processing";

const MAX_LENGTH = 2000;

/**
 * اقتراح/بلاغ الطالب (STEP 55) + صوره (بلاغ مشكلة فقط). teacherId
 * وstudentId من جلسة currentStudent() حصراً — أي قيمة بهذين الاسمين
 * بالـFormData تُتجاهَل تماماً ولا تُقرأ إطلاقاً (نفس مبدأ STEP 54).
 */
export async function POST(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const formData = await request.formData().catch(() => null);
  if (!formData) return Response.json({ error: "طلب غير صحيح" }, { status: 400 });

  const message = String(formData.get("message") ?? "").trim().slice(0, MAX_LENGTH);
  // النموذج المشترك بالواجهة يستخدم نفس تبويبَي المعلّم ("suggestion"/"problem")
  // — نطابقها هنا داخلياً مع kind الطالب ("suggestion"/"bug") بقاعدة البيانات.
  const isBug = formData.get("type") === "problem";
  const kind: StudentSuggestionKind = isBug ? "bug" : "suggestion";
  if (!message) {
    return Response.json({ error: isBug ? "اشرح المشكلة أولاً" : "اكتب اقتراحك أولاً" }, { status: 400 });
  }

  if (!isBug && formData.getAll("images").some((v) => v instanceof File && v.size > 0)) {
    return Response.json({ error: "إرفاق الصور متاح لبلاغ المشكلة فقط" }, { status: 400 });
  }

  if (!(await checkStudentSuggestionRateLimit(student.teacherId, student.id))) {
    return Response.json({ error: "وصلت الحد الأقصى للإرسال هذه الساعة — حاول لاحقاً" }, { status: 429 });
  }

  try {
    const images = isBug ? await readAndProcessAttachments(formData, "images") : [];
    await addStudentSuggestion(student.teacherId, student.id, kind, message, images);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "تعذّر الإرسال" }, { status: 400 });
  }
}
