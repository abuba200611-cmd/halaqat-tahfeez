import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findSuperAdminById, sessionSecret, type SuperAdmin } from "./db";

/*
  جلسة المشرف العام — STEP 5. مبنية على نفس فلسفة جلسة المعلّم
  (lib/auth.ts)، لا على نمط masjid-idara/lib/admin-auth.ts (سرّ ثابت
  واحد بلا جدول حسابات) — لأن عندنا هنا جدول super_admins حقيقي بحسابات
  متعددة محتملة. بادئة "super_admin." داخل الحمولة الموقَّعة، كوكي
  مستقل تماماً. لا علاقة لهذا الملف بـ ADMIN_SECRET أو لوحة /admin
  الحالية (صندوق الاقتراحات) — تلك تبقى كما هي بلا أي لمس.
*/

export const SUPER_ADMIN_SESSION_COOKIE = "super_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // ٣٠ يوماً
const TAG = "super_admin";

async function sign(payload: string): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(payload).digest("hex");
}

export async function createSuperAdminSessionToken(adminId: number): Promise<string> {
  const payload = `${TAG}.${adminId}.${Date.now()}`;
  return `${payload}.${await sign(payload)}`;
}

/** يتحقق من الوسم والتوقيع والصلاحية، ويرجع معرّف المشرف العام أو null */
export async function readSuperAdminSessionToken(token: string): Promise<number | null> {
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

export async function setSuperAdminSessionCookie(adminId: number): Promise<void> {
  const store = await cookies();
  store.set(SUPER_ADMIN_SESSION_COOKIE, await createSuperAdminSessionToken(adminId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSuperAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(SUPER_ADMIN_SESSION_COOKIE);
}

/** المشرف العام صاحب الجلسة الحالية، أو null إن لم يكن مسجّلاً */
export async function currentSuperAdmin(): Promise<SuperAdmin | null> {
  const store = await cookies();
  const token = store.get(SUPER_ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const adminId = await readSuperAdminSessionToken(token);
  return adminId === null ? null : findSuperAdminById(adminId);
}
