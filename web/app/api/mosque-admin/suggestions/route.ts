import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { addReport } from "@/lib/db";
import { isRequestTooLarge, readAndProcessAttachments } from "@/lib/image-processing";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

const MAX_LENGTH = 1000;

/** اقتراح/بلاغ مدير الجامع (نفس نموذج المعلّم — dev split: بلاغ من كل الأدوار) + صوره (بلاغ مشكلة فقط، حتى ٣) */
export async function POST(request: Request) {
  const admin = await currentMosqueAdmin();
  if (!admin) return unauthorized();

  // سقف إرسال لكل مدير: ٢٠ بلاغاً باليوم — قبل معالجة الصور أو قراءة الجسم
  if (!(await checkRateLimit(`suggestion:mosque_admin:${admin.id}`, 20, 86400))) {
    return rateLimited();
  }

  if (isRequestTooLarge(request)) {
    return Response.json({ error: "حجم الطلب أكبر من 4 ميغابايت" }, { status: 413 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) return Response.json({ error: "طلب غير صحيح" }, { status: 400 });

  const message = String(formData.get("message") ?? "").trim().slice(0, MAX_LENGTH);
  const type = formData.get("type") === "problem" ? "problem" : "suggestion";
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
    await addReport("mosque_admin", admin.id, message, type, images);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "تعذّر الإرسال" }, { status: 400 });
  }
}
