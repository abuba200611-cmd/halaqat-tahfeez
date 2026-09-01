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
      return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });
    }

    await setStudentSessionCookie(result.halaqahId, result.studentId);
    await clearStudentGooglePendingCookie();
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر إنشاء الحساب" },
      { status: 500 },
    );
  }
}
