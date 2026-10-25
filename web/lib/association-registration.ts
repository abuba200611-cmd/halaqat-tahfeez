/*
  تسجيل جمعية جديدة (/register-association) — منطق نقي بلا قاعدة بيانات
  ولا cookies، على نمط lib/mosque-registration.ts: يُستخدم من الخادم
  والواجهة والاختبارات، والخادم هو الحَكَم دائماً.
*/

export const REG_ASSOC_NAME_MAX = 100;
export const REG_ASSOC_NUMBER_MAX = 40;
export const REG_REGION_MAX = 60;
export const REG_APPLICANT_MAX = 80;
export const REG_REASON_MAX = 300;

export type AssociationRegistrationInput = {
  associationName: string;
  registrationNumber: string;
  region: string;
  applicantName: string;
  phone: string;
  email: string;
  username: string;
  password: string;
};

export type ParsedAssociationRegistration =
  | { ok: true; value: AssociationRegistrationInput }
  | { ok: false; error: string; field: keyof AssociationRegistrationInput | "confirm" };

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseAssociationRegistrationBody(body: unknown): ParsedAssociationRegistration {
  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const associationName = str(raw.associationName).trim();
  const registrationNumber = str(raw.registrationNumber).trim();
  const region = str(raw.region).trim();
  const applicantName = str(raw.applicantName).trim();
  const phone = str(raw.phone).replace(/[\s-]/g, "");
  const email = str(raw.email).trim().toLowerCase();
  const username = str(raw.username).trim().toLowerCase();
  const password = str(raw.password);
  const confirm = str(raw.confirmPassword);

  if (associationName.length < 2 || associationName.length > REG_ASSOC_NAME_MAX) {
    return { ok: false, field: "associationName", error: `اسم الجمعية من ٢ إلى ${REG_ASSOC_NAME_MAX} حرفاً` };
  }
  if (registrationNumber.length > REG_ASSOC_NUMBER_MAX) {
    return { ok: false, field: "registrationNumber", error: `رقم الترخيص حتى ${REG_ASSOC_NUMBER_MAX} حرفاً` };
  }
  if (region.length < 2 || region.length > REG_REGION_MAX) {
    return { ok: false, field: "region", error: "المنطقة مطلوبة (حتى ٦٠ حرفاً)" };
  }
  if (applicantName.length < 2 || applicantName.length > REG_APPLICANT_MAX) {
    return { ok: false, field: "applicantName", error: `اسم مقدّم الطلب من ٢ إلى ${REG_APPLICANT_MAX} حرفاً` };
  }
  if (!/^\+?\d{8,15}$/.test(phone)) return { ok: false, field: "phone", error: "رقم الجوال غير صحيح (٨ إلى ١٥ رقماً)" };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, field: "email", error: "البريد الإلكتروني غير صحيح" };
  }
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) {
    return { ok: false, field: "username", error: "اسم المستخدم من ٣ إلى ٤٠ حرفاً لاتينياً صغيراً أو أرقاماً أو ._-" };
  }
  if (password.length < 8 || password.length > 200) {
    return { ok: false, field: "password", error: "كلمة المرور من ٨ أحرف إلى ٢٠٠" };
  }
  if (password !== confirm) return { ok: false, field: "confirm", error: "تأكيد كلمة المرور غير مطابق" };
  return {
    ok: true,
    value: { associationName, registrationNumber, region, applicantName, phone, email, username, password },
  };
}

export type AssociationRequestStatus = "pending" | "approved" | "rejected";

/** رسالة صفحة دخول مدير الجمعية لمن لا حساب له بعد لكن له طلب معلّق/مرفوض */
export function associationLoginStatusMessage(status: "pending" | "rejected", reason: string | null): string {
  if (status === "pending") return "طلب تسجيل جمعيتك قيد المراجعة";
  return reason ? `تم رفض طلب تسجيل جمعيتك: ${reason}` : "تم رفض طلب تسجيل جمعيتك";
}
