import { createHmac, timingSafeEqual } from "node:crypto";

/*
  حضور بالرمز (ميزة qr_attendance) — رمز QR دوّار يعرضه المعلّم ويمسحه الطلاب.
  منطق نقي (السرّ يُمرَّر من المستدعي) فيُختبر بمعزل عن قاعدة البيانات.

  صيغة الرمز: v1.<حلقة>.<تاريخ>.<نافذة>.<توقيع>
  - النافذة = floor(الوقت ÷ ٣٠ ثانية) — الرمز يدور كل ٣٠ ثانية.
  - التوقيع = HMAC-SHA256 على الحلقة+التاريخ+النافذة بسرّ الجلسة الخادمي
    (مع بادئة نطاق منفصلة فلا يصلح توقيع الجلسات هنا ولا العكس)، مقصوص إلى
    ١٢٨ بتاً.
  - يُقبل الرمز في نافذته الحالية وحتى ٢ نافذة سابقة (٣٠–٩٠ ثانية) ليتسع
    لتوجيه الطالب لتسجيل الدخول؛ الرمز المستقبلي يُرفض.
  - الحلقة المحسوبة عند التحقق تأتي من جلسة الطالب لا من الرمز، فرمز حلقة
    أخرى يُرفض حتى لو كان توقيعه سليماً.
*/

export const CHECKIN_WINDOW_MS = 30_000;
export const CHECKIN_GRACE_WINDOWS = 2;
const SIG_HEX_LENGTH = 32;
const TOKEN_RE = /^v1\.(\d{1,10})\.(\d{4}-\d{2}-\d{2})\.(\d{1,12})\.([0-9a-f]{32})$/;

export type CheckinFailure = "malformed" | "forged" | "expired" | "future" | "wrong_date" | "wrong_halaqah";

export function windowOf(nowMs: number): number {
  return Math.floor(nowMs / CHECKIN_WINDOW_MS);
}

/** نهاية النافذة الحالية (ms) — تُرسل للعميل ليجدّد الرمز قبل انتهائها */
export function windowEndsAt(nowMs: number): number {
  return (windowOf(nowMs) + 1) * CHECKIN_WINDOW_MS;
}

function sign(secret: string, halaqahId: number, date: string, window: number): string {
  return createHmac("sha256", secret)
    .update(`qr-checkin:v1:${halaqahId}:${date}:${window}`)
    .digest("hex")
    .slice(0, SIG_HEX_LENGTH);
}

export function createCheckinToken(secret: string, halaqahId: number, date: string, nowMs: number): string {
  const window = windowOf(nowMs);
  return `v1.${halaqahId}.${date}.${window}.${sign(secret, halaqahId, date, window)}`;
}

export type VerifyResult = { ok: true } | { ok: false; reason: CheckinFailure };

/**
 * يتحقق من الرمز: الصيغة ← التوقيع ← الحلقة ← التاريخ ← الحداثة. الترتيب مقصود:
 * التوقيع أولاً فلا يُسرَّب شيء عن رمز مزوَّر، وكل الفحوص ثابتة الزمن حيث يلزم.
 */
export function verifyCheckinToken(
  secret: string,
  token: unknown,
  expected: { halaqahId: number; today: string; nowMs: number },
): VerifyResult {
  if (typeof token !== "string" || token.length > 120) return { ok: false, reason: "malformed" };
  const match = TOKEN_RE.exec(token);
  if (!match) return { ok: false, reason: "malformed" };
  const halaqahId = Number(match[1]);
  const date = match[2];
  const window = Number(match[3]);
  if (!Number.isSafeInteger(halaqahId) || !Number.isSafeInteger(window)) return { ok: false, reason: "malformed" };

  const given = Buffer.from(match[4], "utf8");
  const wanted = Buffer.from(sign(secret, halaqahId, date, window), "utf8");
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return { ok: false, reason: "forged" };

  if (halaqahId !== expected.halaqahId) return { ok: false, reason: "wrong_halaqah" };
  if (date !== expected.today) return { ok: false, reason: "wrong_date" };

  const age = windowOf(expected.nowMs) - window;
  if (age < 0) return { ok: false, reason: "future" };
  if (age > CHECKIN_GRACE_WINDOWS) return { ok: false, reason: "expired" };
  return { ok: true };
}

export const CHECKIN_FAILURE_MESSAGE: Record<CheckinFailure, string> = {
  malformed: "رمز غير صالح — امسح الرمز من شاشة معلّمك",
  forged: "رمز غير صالح — امسح الرمز من شاشة معلّمك",
  future: "رمز غير صالح — امسح الرمز من شاشة معلّمك",
  wrong_date: "هذا الرمز ليوم آخر — امسح الرمز الحالي",
  expired: "انتهت صلاحية الرمز — امسح الرمز الجديد من شاشة معلّمك",
  wrong_halaqah: "هذا الرمز لحلقة أخرى",
};

export const QR_ATTENDANCE_FEATURE_KEY = "qr_attendance";

/** مسار صفحة الطالب الذي يحمله الرمز — نسبي، والمعلّم يضيف أصل الموقع من متصفحه */
export function checkinPath(token: string): string {
  return `/student/checkin?t=${encodeURIComponent(token)}`;
}
