/*
  قواعد صفحات الإعدادات المشتركة بين كل الأدوار — دوال نقية بلا اعتماد على
  الخادم، فتُختبر مباشرة وتُستورد من العميل أيضاً:
  - اسم العرض (٢–٦٠ حرفاً بعد القصّ)
  - حدّ كلمة المرور الأدنى (نفس حدّ التسجيل: ٨ أحرف)
  - حساب بلا كلمة مرور محلية (جوجل فقط): بصمته عشوائية بلا ":" فلا يتحقق منها verifyPassword
*/

export const DISPLAY_NAME_MIN = 2;
export const DISPLAY_NAME_MAX = 60;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 200;

export type NameResult = { ok: true; name: string } | { ok: false; error: string };

/** يقصّ الاسم ويتحقق من طوله (بالحروف لا بالبايتات) ومن خلوّه من محارف التحكم */
export function normalizeDisplayName(raw: unknown): NameResult {
  if (typeof raw !== "string") return { ok: false, error: "الاسم مطلوب" };
  const name = raw.trim();
  if (/[\u0000-\u001f\u007f]/.test(name)) return { ok: false, error: "الاسم يحوي محارف غير مقبولة" };
  const length = [...name].length;
  if (length < DISPLAY_NAME_MIN || length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `الاسم من ${DISPLAY_NAME_MIN} إلى ${DISPLAY_NAME_MAX} حرفاً` };
  }
  return { ok: true, name };
}

/** بصمة بصيغة salt:hash فقط تُعدّ كلمة مرور محلية — غيرها (جوجل أو موقوف) لا كلمة مرور له */
export function hasLocalPassword(passwordHash: string | null | undefined): boolean {
  if (!passwordHash) return false;
  const [salt, hash] = passwordHash.split(":");
  return Boolean(salt) && Boolean(hash);
}

export type PasswordChangeInput = { current: string; next: string; confirm: string };
export type PasswordChangeCheck = { ok: true; input: PasswordChangeInput } | { ok: false; error: string };

/** يتحقق من حقول النموذج الثلاثة قبل أي عملية تجزئة */
export function validatePasswordChange(body: {
  currentPassword?: unknown;
  newPassword?: unknown;
  confirmPassword?: unknown;
}): PasswordChangeCheck {
  const current = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const next = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirm = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!current) return { ok: false, error: "أدخل كلمة المرور الحالية" };
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `كلمة المرور الجديدة ${MIN_PASSWORD_LENGTH} أحرف فأكثر` };
  }
  if (next.length > MAX_PASSWORD_LENGTH) return { ok: false, error: "كلمة المرور الجديدة طويلة جداً" };
  if (next !== confirm) return { ok: false, error: "تأكيد كلمة المرور غير مطابق" };
  if (next === current) return { ok: false, error: "كلمة المرور الجديدة مطابقة للحالية" };
  return { ok: true, input: { current, next, confirm } };
}
