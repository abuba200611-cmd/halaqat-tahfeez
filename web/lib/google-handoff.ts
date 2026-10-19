import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionSecret } from "./db";
import { GOOGLE_HANDOFF_COOKIE } from "./landing";

/*
  تسليم جوجل → التسجيل: لمّا يدخل أحد بجوجل ولا حساب لبريده، لا ننشئ حساباً
  ناقصاً؛ نحمله لـ/signup بهويته من جوجل (البريد والاسم) داخل رمز موقّع
  بـHMAC بسرّ الجلسات نفسه (مع بادئة نطاق منفصلة فلا يصلح رمز جلسة هنا ولا
  العكس) وصلاحيته ١٠ دقائق، فلا يُعيد توثيق بريده. البريد المعتمد عند إنشاء
  الحساب يُقرأ دائماً من هذا الرمز الموقّع لا من جسم الطلب.
*/

export const GOOGLE_HANDOFF_TTL_SECONDS = 10 * 60;
const DOMAIN = "google-handoff-v1:";

export type GoogleHandoff = { email: string; name: string };

function mac(secret: string, body: string): string {
  return createHmac("sha256", secret).update(DOMAIN + body).digest("base64url");
}

/** يبني الرمز الموقّع — دالة نقية (السرّ والوقت مُمرَّران) لسهولة الاختبار */
export function signGoogleHandoff(handoff: GoogleHandoff, secret: string, now = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ e: handoff.email, n: handoff.name, x: now + GOOGLE_HANDOFF_TTL_SECONDS * 1000 }),
  ).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

/** يتحقق من التوقيع والصلاحية؛ أي عبث أو انتهاء → null */
export function verifyGoogleHandoff(token: string, secret: string, now = Date.now()): GoogleHandoff | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = mac(secret, body);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString()) as { e?: unknown; n?: unknown; x?: unknown };
    if (typeof data.e !== "string" || typeof data.n !== "string" || typeof data.x !== "number") return null;
    if (!data.e || now > data.x) return null;
    return { email: data.e, name: data.n };
  } catch {
    return null;
  }
}

/** يضبط كوكي التسليم (httpOnly) — يُستدعى من callback جوجل */
export async function setGoogleHandoffCookie(handoff: GoogleHandoff): Promise<void> {
  const store = await cookies();
  store.set(GOOGLE_HANDOFF_COOKIE, signGoogleHandoff(handoff, await sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GOOGLE_HANDOFF_TTL_SECONDS,
  });
}

/** التسليم الصالح الحالي من الكوكي، أو null */
export async function readGoogleHandoff(): Promise<GoogleHandoff | null> {
  const token = (await cookies()).get(GOOGLE_HANDOFF_COOKIE)?.value;
  if (!token) return null;
  return verifyGoogleHandoff(token, await sessionSecret());
}

export async function clearGoogleHandoffCookie(): Promise<void> {
  (await cookies()).delete(GOOGLE_HANDOFF_COOKIE);
}
