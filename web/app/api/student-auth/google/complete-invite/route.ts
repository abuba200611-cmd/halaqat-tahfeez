import * as Sentry from "@sentry/nextjs";
import { checkInviteRateLimit, createGoogleStudentAccount, recordFailedInviteAttempt } from "@/lib/db";
import { setStudentSessionCookie } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import {
  clearStudentGooglePendingCookie,
  readStudentGooglePendingCookie,
} from "@/lib/student-google-auth";

const ENDPOINT = "student-auth/google/complete-invite";
const RETRY_AFTER_SECONDS = 60 * 60;

/**
 * فحص حدّ تخمين رمز الدعوة (STEP 33 — F-05) + تسجيل هذي المحاولة
 * الفاشلة إن لم يتجاوز — يُستدعى من فرعي الفشل فقط (٤٠٤ وcatch/٥٠٠)،
 * أبداً من مسار النجاح. يرجع Response جاهزاً (٤٢٩) لو تجاوز الحدّ، أو
 * null ليكمل الفرع المستدعي رده الأصلي بعد تسجيل المحاولة.
 */
async function checkInviteAttempt(ip: string): Promise<Response | null> {
  try {
    if (!(await checkInviteRateLimit(ip))) {
      return Response.json(
        { error: "محاولات كثيرة، حاول لاحقاً" },
        { status: 429, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } },
      );
    }
    await recordFailedInviteAttempt(ip, ENDPOINT);
  } catch (error) {
    Sentry.captureException(error);
  }
  return null;
}

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
      const limited = await checkInviteAttempt(clientIp(request));
      if (limited) return limited;
      return Response.json(
        { error: "رمز الدعوة غير صحيح — سجّل الدخول بحساب جوجل مرة أخرى ثم أعد المحاولة بالرمز الصحيح" },
        { status: 404 },
      );
    }

    await setStudentSessionCookie(result.halaqahId, result.studentId);
    return Response.json({ ok: true });
  } catch (error) {
    // بلوغ هذا الفرع يعني أن رمز الدعوة كان صحيحاً فعلاً (تجاوز فرع
    // !result أعلاه) وأن الفشل جاء بعده — أخطر من ٤٠٤ لا أقل، فيُحسب
    // على نفس حدّ التخمين (STEP 33)، وإلا كان الفرع الأكثر كشفاً هو
    // الوحيد بلا سقف. تبسيط مقصود: لو كان الرمي تحديداً من
    // setStudentSessionCookie بعد أن نجح إنشاء الحساب فعلاً، فهذا انضمام
    // ناجح لا محاولة تخمين، ونحسبه هنا خطأً — حالة نادرة (خانة واحدة من
    // الحدّ)، أثرها ضئيل (الطالب يتعافى بمحاولة دخول عادية لاحقاً)،
    // تُركت بلا تمييز عمداً تفادياً لتعقيد لا يستحقه احتمال هامشي.
    const limited = await checkInviteAttempt(clientIp(request));
    if (limited) return limited;
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر إنشاء الحساب" },
      { status: 500 },
    );
  }
}
