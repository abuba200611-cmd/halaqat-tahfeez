import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findMosqueAdminById, sessionSecret, type MosqueAdmin } from "./db";

/*
  جلسة مدير الجامع — STEP 5 من خطة MVP Migration Foundation. نفس آلية
  توقيع جلسة المعلّم بالضبط (lib/auth.ts): HMAC بسرّ sessionSecret()
  المشترك (لا سرّ جديد)، مع بادئة نصية "mosque_admin." داخل الحمولة
  الموقَّعة نفسها — نفس حيلة جلسة الطالب الحالية، تمنع أي التباس بين
  أنواع الجلسات حتى لو تسرّب توكن لكوكي غلط. كوكي مستقل تماماً عن
  halaqa_session/halaqa_student، فلا تعارض ممكن.
*/

export const MOSQUE_ADMIN_SESSION_COOKIE = "mosque_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // ٣٠ يوماً
const TAG = "mosque_admin";

async function sign(payload: string): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(payload).digest("hex");
}

export async function createMosqueAdminSessionToken(adminId: number): Promise<string> {
  const payload = `${TAG}.${adminId}.${Date.now()}`;
  return `${payload}.${await sign(payload)}`;
}

/** يتحقق من الوسم والتوقيع والصلاحية، ويرجع معرّف مدير الجامع أو null */
export async function readMosqueAdminSessionToken(token: string): Promise<number | null> {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [tag, idPart, issuedPart, signature] = parts;
  if (tag !== TAG) return null;

  const expected = await sign(`${tag}.${idPart}.${issuedPart}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const issuedAt = Number(issuedPart);
  const adminId = Number(idPart);
  if (!Number.isFinite(issuedAt) || !Number.isInteger(adminId)) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return adminId;
}

export async function setMosqueAdminSessionCookie(adminId: number): Promise<void> {
  const store = await cookies();
  store.set(MOSQUE_ADMIN_SESSION_COOKIE, await createMosqueAdminSessionToken(adminId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearMosqueAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(MOSQUE_ADMIN_SESSION_COOKIE);
}

/** مدير الجامع صاحب الجلسة الحالية، أو null إن لم يكن مسجّلاً */
export async function currentMosqueAdmin(): Promise<MosqueAdmin | null> {
  const store = await cookies();
  const token = store.get(MOSQUE_ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const adminId = await readMosqueAdminSessionToken(token);
  return adminId === null ? null : findMosqueAdminById(adminId);
}
