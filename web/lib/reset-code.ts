import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { RESET_CODE_SUBJECT, resetCodeEmailHtml } from "@/lib/reset-code-mail";

/*
  استرجاع كلمة المرور برمز من ٦ أرقام (بدل الرابط).
  - الرمز من crypto.randomInt، ولا يُخزَّن إلا HMAC مملّح بسرّ الخادم ومربوط بمعرّف المعلّم.
  - صلاحية ١٠ دقائق، ٥ محاولات خاطئة كحدّ أقصى ثم يُحرق، ولمرة واحدة، والطلب الجديد يُبطل السابق.
  - المنطق هنا يعتمد على «اعتماديات» (deps) يحقنها المسار الرقيق، فيُختبر كله بلا قاعدة بيانات.
*/

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const MIN_PASSWORD_LENGTH = 8; // نفس حد التسجيل (app/api/auth/register)
export const SEND_EMAIL_LIMIT = 3;
export const SEND_IP_LIMIT = 10;
export const VERIFY_IP_LIMIT = 20;
export const WINDOW_SECONDS = 15 * 60;

export const SEND_OK_MESSAGE = "إذا كان البريد مسجّلاً سيصلك رمز";
export const INVALID_CODE_MESSAGE = "الرمز غير صحيح أو منتهي — اطلب رمزاً جديداً";

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashResetCode(code: string, teacherId: number, secret: string): string {
  return createHmac("sha256", secret).update(`reset-code:${teacherId}:${code}`).digest("hex");
}

export type ResetTeacher = { id: number; deactivatedAt?: string | null };

export type ResetDeps = {
  now: () => Date;
  secret: () => Promise<string>;
  findTeacher: (email: string) => Promise<ResetTeacher | null>;
  replaceCode: (teacherId: number, codeHash: string, expiresAt: Date) => Promise<void>;
  bumpAttempt: (teacherId: number, now: Date) => Promise<{ id: number; codeHash: string; attempts: number } | null>;
  burn: (id: number) => Promise<boolean>;
  sendMail: (to: string, subject: string, html: string) => Promise<boolean>;
  setPassword: (teacherId: number, passwordHash: string) => Promise<void>;
  rateLimit: (key: string, limit: number, windowSeconds: number) => Promise<boolean>;
};

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** رد الإرسال: نفس الجواب دائماً سواء كان البريد مسجّلاً أم لا (وسواء بلغ حدّ البريد أم لا) */
export async function requestResetCode(
  rawEmail: unknown,
  ip: string,
  deps: ResetDeps,
): Promise<{ status: 200 | 429; body: { ok?: true; message?: string; error?: string } }> {
  if (!(await deps.rateLimit(`reset-send-ip:${ip}`, SEND_IP_LIMIT, WINDOW_SECONDS))) {
    return { status: 429, body: { error: "محاولات كثيرة، حاول بعد شوي" } };
  }
  const generic = { status: 200 as const, body: { ok: true as const, message: SEND_OK_MESSAGE } };

  const email = normalizeEmail(rawEmail);
  if (!email) return generic;
  // الحدّ على البريد يُحتسب سواء وُجد الحساب أم لا — فلا يكشف شيئاً، ولا يُغرق صندوق أحد
  if (!(await deps.rateLimit(`reset-send-email:${email}`, SEND_EMAIL_LIMIT, WINDOW_SECONDS))) return generic;

  const teacher = await deps.findTeacher(email);
  if (!teacher || teacher.deactivatedAt) return generic;

  const code = generateCode();
  const hash = hashResetCode(code, teacher.id, await deps.secret());
  await deps.replaceCode(teacher.id, hash, new Date(deps.now().getTime() + CODE_TTL_MS));
  await deps.sendMail(email, RESET_CODE_SUBJECT, resetCodeEmailHtml(code));
  return generic;
}

export type ConfirmResult =
  | { ok: true; teacherId: number }
  | { ok: false; status: 400 | 429; error: string };

/** يتحقق من الرمز ويعيّن كلمة المرور. الجلسة (الكوكي) يضبطها المسار بعد النجاح. */
export async function confirmResetCode(
  input: { email: unknown; code: unknown; password: unknown; confirm?: unknown },
  ip: string,
  deps: ResetDeps,
): Promise<ConfirmResult> {
  if (!(await deps.rateLimit(`reset-verify-ip:${ip}`, VERIFY_IP_LIMIT, WINDOW_SECONDS))) {
    return { ok: false, status: 429, error: "محاولات كثيرة، حاول بعد شوي" };
  }
  const email = normalizeEmail(input.email);
  const code = String(input.code ?? "").trim();
  const password = String(input.password ?? "");

  if (!/^\d{6}$/.test(code)) return { ok: false, status: 400, error: "الرمز ٦ أرقام" };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, status: 400, error: `كلمة المرور ${MIN_PASSWORD_LENGTH} أحرف فأكثر` };
  }
  if (input.confirm !== undefined && String(input.confirm) !== password) {
    return { ok: false, status: 400, error: "تأكيد كلمة المرور غير مطابق" };
  }

  const invalid: ConfirmResult = { ok: false, status: 400, error: INVALID_CODE_MESSAGE };
  const teacher = email ? await deps.findTeacher(email) : null;
  if (!teacher || teacher.deactivatedAt) return invalid;

  const row = await deps.bumpAttempt(teacher.id, deps.now());
  if (!row) return invalid;
  if (row.attempts > MAX_ATTEMPTS) {
    await deps.burn(row.id);
    return invalid;
  }

  const expected = Buffer.from(row.codeHash, "hex");
  const actual = Buffer.from(hashResetCode(code, teacher.id, await deps.secret()), "hex");
  const match = expected.length === actual.length && timingSafeEqual(expected, actual);
  if (!match) {
    if (row.attempts >= MAX_ATTEMPTS) await deps.burn(row.id);
    return invalid;
  }

  // الحرق الذرّي قبل التعيين: طلبان متزامنان بنفس الرمز الصحيح — واحد فقط ينجح
  if (!(await deps.burn(row.id))) return invalid;
  await deps.setPassword(teacher.id, hashPassword(password));
  return { ok: true, teacherId: teacher.id };
}
