import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sessionSecret } from "./db";
import { findAssociationAdminById, type AssociationAdmin } from "./association-db";

/*
  جلسة مدير الجمعية — كوكي مستقل تماماً (association_admin_session) بوسم
  "association_admin" داخل الحمولة الموقَّعة، وبخمسة أجزاء (فيها session_version)
  بينما جلسة مدير الجامع أربعة وتحمل وسماً آخر: فلا يتبادل أيٌّ منهما القبول
  مع الآخر ولا مع جلسات المعلّم/الطالب/ولي الأمر/الأدمن حتى لو التُقط توكن
  في كوكي غلط. session_version يبطل كل الجلسات القائمة عند تغيير كلمة المرور.
  التوقيع بسرّ sessionSecret() المشترك (لا سرّ جديد) كباقي الأنواع.
*/

export const ASSOCIATION_ADMIN_SESSION_COOKIE = "association_admin_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 14; // أسبوعان
const TAG = "association_admin";

async function sign(payload: string): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(payload).digest("hex");
}

export async function createAssociationAdminSessionToken(adminId: number, sessionVersion: number): Promise<string> {
  const payload = `${TAG}.${adminId}.${sessionVersion}.${Date.now()}`;
  return `${payload}.${await sign(payload)}`;
}

/** يتحقق من الوسم والتوقيع والصلاحية، ويرجع المعرّف والإصدار أو null */
export async function readAssociationAdminSessionToken(
  token: string,
): Promise<{ adminId: number; sessionVersion: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [tag, idPart, versionPart, issuedPart, signature] = parts;
  if (tag !== TAG) return null;

  const expected = await sign(`${tag}.${idPart}.${versionPart}.${issuedPart}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const issuedAt = Number(issuedPart);
  const adminId = Number(idPart);
  const sessionVersion = Number(versionPart);
  if (!Number.isFinite(issuedAt) || !Number.isInteger(adminId) || !Number.isInteger(sessionVersion)) return null;
  if (sessionVersion < 0) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return { adminId, sessionVersion };
}

export async function setAssociationAdminSessionCookie(adminId: number, sessionVersion: number): Promise<void> {
  const store = await cookies();
  store.set(ASSOCIATION_ADMIN_SESSION_COOKIE, await createAssociationAdminSessionToken(adminId, sessionVersion), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAssociationAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ASSOCIATION_ADMIN_SESSION_COOKIE);
}

/** مدير الجمعية صاحب الجلسة الحالية، أو null (التوكن فاسد، أو الحساب محذوف، أو الإصدار قديم) */
export async function currentAssociationAdmin(): Promise<AssociationAdmin | null> {
  const store = await cookies();
  const token = store.get(ASSOCIATION_ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await readAssociationAdminSessionToken(token);
  if (!session) return null;
  const admin = await findAssociationAdminById(session.adminId);
  if (!admin || admin.sessionVersion !== session.sessionVersion) return null;
  return admin;
}
