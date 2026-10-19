/*
  تسجيل جامع جديد (/register-mosque) — منطق نقي بلا قاعدة بيانات ولا cookies،
  يشاركه الخادم والواجهة والاختبارات. التحقق كله هنا ويُعاد على الخادم دائماً.
*/

export const REG_MOSQUE_NAME_MAX = 100;
export const REG_CITY_MAX = 60;
export const REG_APPLICANT_MAX = 80;
export const REG_ASSOCIATION_MAX = 100;
export const REG_REASON_MAX = 300;

export type MosqueRegistrationInput = {
  mosqueName: string;
  city: string;
  applicantName: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  associationName: string;
};

export type ParsedMosqueRegistration =
  | { ok: true; value: MosqueRegistrationInput }
  | { ok: false; error: string; field: keyof MosqueRegistrationInput | "confirm" };

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function parseMosqueRegistrationBody(body: unknown): ParsedMosqueRegistration {
  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const mosqueName = str(raw.mosqueName).trim();
  const city = str(raw.city).trim();
  const applicantName = str(raw.applicantName).trim();
  const phone = str(raw.phone).replace(/[\s-]/g, "");
  const email = str(raw.email).trim().toLowerCase();
  const username = str(raw.username).trim().toLowerCase();
  const password = str(raw.password);
  const confirm = str(raw.confirmPassword);
  const associationName = str(raw.associationName).trim();

  if (mosqueName.length < 2 || mosqueName.length > REG_MOSQUE_NAME_MAX) {
    return { ok: false, field: "mosqueName", error: `اسم الجامع من ٢ إلى ${REG_MOSQUE_NAME_MAX} حرفاً` };
  }
  if (city.length > REG_CITY_MAX) return { ok: false, field: "city", error: `المدينة أو الحي حتى ${REG_CITY_MAX} حرفاً` };
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
  if (associationName.length > REG_ASSOCIATION_MAX) {
    return { ok: false, field: "associationName", error: `اسم الجمعية حتى ${REG_ASSOCIATION_MAX} حرفاً` };
  }
  return { ok: true, value: { mosqueName, city, applicantName, phone, email, username, password, associationName } };
}

/** سبب الرفض: نص مطلوب من ٣ إلى ٣٠٠ حرف */
export function parseRejectReason(body: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const raw = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const reason = str(raw.reason).trim();
  if (reason.length < 3 || reason.length > REG_REASON_MAX) {
    return { ok: false, error: `سبب الرفض من ٣ إلى ${REG_REASON_MAX} حرفاً` };
  }
  return { ok: true, reason };
}

export type RegistrationRequestStatus = "pending" | "approved" | "rejected";

/** رسالة صفحة دخول مدير الجامع لمن لا حساب له بعد لكن له طلب معلّق/مرفوض */
export function loginStatusMessage(status: "pending" | "rejected", reason: string | null): string {
  if (status === "pending") return "طلب تسجيل جامعك قيد المراجعة";
  return reason ? `تم رفض طلب تسجيل جامعك: ${reason}` : "تم رفض طلب تسجيل جامعك";
}
