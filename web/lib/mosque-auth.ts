import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { recordSeen } from "./activity";
import { findMosqueAdminById, mosqueAdminSessionVersion, sessionSecret, type MosqueAdmin } from "./db";
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from "./session-cookie";

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

export async function createMosqueAdminSessionToken(adminId: number, sessionVersion = 0): Promise<string> {
  const payload = `${TAG}.${adminId}.${sessionVersion}.${Date.now()}`;
  return `${payload}.${await sign(payload)}`;
}

/**
 * يتحقق من الوسم والتوقيع والصلاحية، ويرجع المعرّف ونسخة الجلسة أو null.
 * الرموز القديمة (٤ أجزاء، بلا نسخة) تُقرأ كنسخة ٠ فلا يخرج أحد عند النشر.
 */
export async function readMosqueAdminSession(
  token: string,
): Promise<{ adminId: number; sessionVersion: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 4 && parts.length !== 5) return null;
  const hasVersion = parts.length === 5;
  const tag = parts[0];
  const idPart = parts[1];
  const versionPart = hasVersion ? parts[2] : "0";
  const issuedPart = hasVersion ? parts[3] : parts[2];
  const signature = hasVersion ? parts[4] : parts[3];
  if (tag !== TAG) return null;

  const expected = await sign(
    hasVersion ? `${tag}.${idPart}.${versionPart}.${issuedPart}` : `${tag}.${idPart}.${issuedPart}`,
  );
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const issuedAt = Number(issuedPart);
  const adminId = Number(idPart);
  const sessionVersion = Number(versionPart);
  if (!Number.isFinite(issuedAt) || !Number.isInteger(adminId)) return null;
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return { adminId, sessionVersion };
}

/** معرّف مدير الجامع فقط (للتوافق) أو null */
export async function readMosqueAdminSessionToken(token: string): Promise<number | null> {
  return (await readMosqueAdminSession(token))?.adminId ?? null;
}

/** يصدر كوكي الجلسة بنسخة الحساب الحالية (تُقرأ من القاعدة ما لم تُمرَّر) */
export async function setMosqueAdminSessionCookie(adminId: number, sessionVersion?: number): Promise<void> {
  const version = sessionVersion ?? (await mosqueAdminSessionVersion(adminId));
  const store = await cookies();
  writeSessionCookie(
    store,
    MOSQUE_ADMIN_SESSION_COOKIE,
    await createMosqueAdminSessionToken(adminId, version),
    SESSION_MAX_AGE_SECONDS,
  );
}

export async function clearMosqueAdminSession(): Promise<void> {
  const store = await cookies();
  clearSessionCookie(store, MOSQUE_ADMIN_SESSION_COOKIE);
}

/** مدير الجامع صاحب الجلسة الحالية، أو null إن لم يكن مسجّلاً */
export async function currentMosqueAdmin(): Promise<MosqueAdmin | null> {
  const store = await cookies();
  const token = readSessionCookie(store, MOSQUE_ADMIN_SESSION_COOKIE);
  if (!token) return null;

  const session = await readMosqueAdminSession(token);
  if (session === null) return null;
  const admin = await findMosqueAdminById(session.adminId);
  if (!admin) return null;
  // عدم تطابق النسخة = صدر الرمز قبل تغيير كلمة المرور — غير موثّق
  if ((admin.sessionVersion ?? 0) !== session.sessionVersion) return null;
  // نشاط الحسابات: آخر ظهور (مكبوح ١٠ دقائق، صامت الفشل، بلا نسبة أثناء «عرض كـ»)
  await recordSeen({ role: "mosque_admin", adminId: admin.id });
  return admin;
}
