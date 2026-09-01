import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionSecret } from "./db";

/*
  دخول Google للطالب — STEP 6A (مسار "طالب جديد" فقط). منفصل تماماً عن
  google-auth.ts الخاص بالمعلّم: كوكيات مستقلة، لا يمسّ حالة المعلّم.

  مرحلتان بكوكيين قصيرَي الأجل مختلفَي الغرض:
  1) state: حماية CSRF لرحلة OAuth نفسها — نفس نمط app/api/auth/google/start
     الخاص بالمعلّم، لكن بكوكي مستقل (student_google_oauth_state).
  2) pending: بعد نجاح Google وعدم وجود sub في student_accounts، نحفظ
     (sub, email) بكوكي موقّع HMAC قصير الأجل حتى يُكمل الطالب رمز
     الدعوة + اسمه. البريد هنا للعرض فقط — لا يُستخدم أبداً كمفتاح مطابقة.
*/

const STATE_COOKIE = "student_google_oauth_state";
const PENDING_COOKIE = "student_google_pending";
const PENDING_MAX_AGE_SECONDS = 60 * 10; // ١٠ دقائق تكفي لإكمال النموذج
const PENDING_TAG = "student_google_pending";

async function sign(payload: string): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(payload).digest("hex");
}

/** يولّد state جديداً ويحفظه بكوكي قصير الأجل، ويرجعه لبنائه برابط جوجل */
export async function createStudentGoogleState(): Promise<string> {
  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // ١٠ دقائق تكفي لإتمام الموافقة — نفس مهلة مسار المعلّم
  });
  return state;
}

/** يتحقق من تطابق state مع الكوكي المحفوظة، ويحذفها فوراً بأي حال */
export async function consumeStudentGoogleState(state: string): Promise<boolean> {
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);
  return !!expected && expected === state;
}

function pendingPayload(sub: string, email: string, issuedAt: number): string {
  const encodedSub = Buffer.from(sub).toString("base64url");
  const encodedEmail = Buffer.from(email).toString("base64url");
  return `${PENDING_TAG}.${encodedSub}.${encodedEmail}.${issuedAt}`;
}

/** يبني توكن الهوية المعلَّقة الموقَّع — دالة صِرفة بلا كوكي، لسهولة اختبارها */
export async function createStudentGooglePendingToken(sub: string, email: string): Promise<string> {
  const payload = pendingPayload(sub, email, Date.now());
  return `${payload}.${await sign(payload)}`;
}

/** يتحقق من توقيع التوكن وصلاحيته، ويرجع (sub, email) أو null — دالة صِرفة أيضاً */
export async function readStudentGooglePendingToken(
  token: string,
): Promise<{ sub: string; email: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [tag, encodedSub, encodedEmail, issuedPart, signature] = parts;
  if (tag !== PENDING_TAG) return null;

  const expected = await sign(`${tag}.${encodedSub}.${encodedEmail}.${issuedPart}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const issuedAt = Number(issuedPart);
  if (!Number.isFinite(issuedAt)) return null;
  if (Date.now() - issuedAt > PENDING_MAX_AGE_SECONDS * 1000) return null;

  const sub = Buffer.from(encodedSub, "base64url").toString();
  const email = Buffer.from(encodedEmail, "base64url").toString();
  if (!sub) return null;
  return { sub, email };
}

/** يحفظ هوية جوجل (sub + email للعرض فقط) مؤقتاً بين نجاح Google وإكمال رمز الدعوة */
export async function setStudentGooglePendingCookie(sub: string, email: string): Promise<void> {
  const token = await createStudentGooglePendingToken(sub, email);
  const store = await cookies();
  store.set(PENDING_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PENDING_MAX_AGE_SECONDS,
  });
}

/** يقرأ هوية جوجل المعلَّقة الحالية، أو null إن لم تكن موجودة/صالحة */
export async function readStudentGooglePendingCookie(): Promise<{ sub: string; email: string } | null> {
  const store = await cookies();
  const token = store.get(PENDING_COOKIE)?.value;
  return token ? readStudentGooglePendingToken(token) : null;
}

export async function clearStudentGooglePendingCookie(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_COOKIE);
}
