import { createGoogleStudentAccount } from "@/lib/db";
import { setStudentSessionCookie } from "@/lib/auth";
import {
  clearStudentGooglePendingCookie,
  readStudentGooglePendingCookie,
} from "@/lib/student-google-auth";

/**
 * يكمل إنشاء "طالب جديد" بعد نجاح Google: يتحقق من رمز الدعوة، ينشئ
 * السجل الأكاديمي وحساب جوجل معاً بعملية واحدة، ثم يفتح جلسة الطالب
 * العادية (halaqa_student) — بلا أي كوكي جديد يتعارض معها.
 */
export async function POST(request: Request) {
  const pending = await readStudentGooglePendingCookie();

  // الكوكي المعلَّقة أحادية الاستخدام بنيوياً: تُمسَح فور قراءتها هنا،
  // قبل أي تفرّع لاحق — لا بإضافتها يدوياً بكل فرع خروج على حدة. sub
  // وemail محفوظان بالمتغيّر بالذاكرة أعلاه، فلا شيء لاحقاً يحتاج الكوكي
  // نفسها. بدون هذا، تبقى الكوكي (صالحة ١٠ دقائق) قابلة لإعادة الاستخدام
  // بعد أي فشل — رمز دعوة خاطئ (٤٠٤) أو حتى استثناء بعد نجاح الرمز
  // (٥٠٠، وهو أخطر لأنه oracle على رمز صحيح فعلاً) — فيتحوّل دخول Google
  // واحد لعدد محاولات غير محدود على مساحة الرمز.
  try {
    await clearStudentGooglePendingCookie();
  } catch {
    // فشل المسح لا يجوز أن يُسقط الطلب — يكمل بنفس السلوك المقصود أدناه
  }

  if (!pending) {
    return Response.json(
      { error: "انتهت جلسة الدخول بجوجل — سجّل الدخول بحساب جوجل مرة أخرى" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const inviteCode = String(body.inviteCode ?? "").trim();
  const studentName = String(body.studentName ?? "").trim();
  if (!inviteCode || !studentName) {
    return Response.json({ error: "أدخل الاسم ورمز الدعوة" }, { status: 400 });
  }

  try {
    const result = await createGoogleStudentAccount({
      inviteCode,
      studentName,
      providerSubject: pending.sub,
      providerEmail: pending.email,
    });
    if (!result) {
      return Response.json(
        { error: "رمز الدعوة غير صحيح — سجّل الدخول بحساب جوجل مرة أخرى ثم أعد المحاولة بالرمز الصحيح" },
        { status: 404 },
      );
    }

    await setStudentSessionCookie(result.halaqahId, result.studentId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر إنشاء الحساب" },
      { status: 500 },
    );
  }
}
