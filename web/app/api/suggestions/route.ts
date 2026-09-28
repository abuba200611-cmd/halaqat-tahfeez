import { currentTeacher, unauthorized } from "@/lib/auth";
import { addSuggestion, type SuggestionType } from "@/lib/db";
import { readAndProcessAttachments } from "@/lib/image-processing";

const MAX_LENGTH = 1000;

/** الاقتراح/البلاغ (نص FormData لا JSON — STEP 55ب يحتاج ملفات) + صوره (بلاغ مشكلة فقط، حتى ٣) */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const formData = await request.formData().catch(() => null);
  if (!formData) return Response.json({ error: "طلب غير صحيح" }, { status: 400 });

  const message = String(formData.get("message") ?? "").trim().slice(0, MAX_LENGTH);
  const type: SuggestionType = formData.get("type") === "problem" ? "problem" : "suggestion";
  if (!message) {
    return Response.json(
      { error: type === "problem" ? "اشرح المشكلة أولاً" : "اكتب اقتراحك أولاً" },
      { status: 400 },
    );
  }

  if (type !== "problem" && formData.getAll("images").some((v) => v instanceof File && v.size > 0)) {
    return Response.json({ error: "إرفاق الصور متاح لبلاغ المشكلة فقط" }, { status: 400 });
  }

  try {
    const images = type === "problem" ? await readAndProcessAttachments(formData, "images") : [];
    await addSuggestion(teacher.id, `${teacher.halaqahName || "حلقة"} (${teacher.username})`, message, type, images);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "تعذّر الإرسال" }, { status: 400 });
  }
}
