import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { recordSeen } from "./activity";
import { sessionSecret } from "./db";
import { findParentById, parentSessionVersion, type Parent } from "./parent-db";
import { clearSessionCookie, readSessionCookie, writeSessionCookie } from "./session-cookie";

/*
  STEP 61 — جلسة ولي الأمر. كوكي منفصل بصيغة حمولة مميّزة
  ("parent.<id>.<version>.<issuedAt>" + التوقيع = ٥ أجزاء) بوسم "parent"
  داخل الجزء الموقَّع: قارئا المعلّم (٣–٤ أجزاء، الأول رقمي) والطالب
  (وسم "student") يرفضانه، وقارئ الولي يرفض أي رمز بوسم آخر — فلا يُقبل
  رمز أحدهم عند غيره حتى لو نُسخ بين الكوكيز. نفس تجزئة HMAC ونفس سرّ
  الجلسات (SESSION_SECRET / app_settings) بلا لمس lib/auth.ts.
*/

export const PARENT_SESSION_COOKIE = "halaqa_parent";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // ٣٠ يوماً

async function sign(payload: string): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(payload).digest("hex");
}

export async function createParentSessionToken(parentId: number, sessionVersion: number): Promise<string> {
  const payload = `parent.${parentId}.${sessionVersion}.${Date.now()}`;
  return `${payload}.${await sign(payload)}`;
}

/** يتحقق من الوسم والتوقيع والصلاحية، ويرجع هوية جلسة ولي الأمر أو null */
export async function readParentSessionToken(
  token: string,
): Promise<{ parentId: number; sessionVersion: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [tag, idPart, versionPart, issuedPart, signature] = parts;
  if (tag !== "parent") return null;

  const expected = await sign(`${tag}.${idPart}.${versionPart}.${issuedPart}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const issuedAt = Number(issuedPart);
  const parentId = Number(idPart);
  const sessionVersion = Number(versionPart);
  if (!Number.isFinite(issuedAt) || !Number.isInteger(parentId)) return null;
  if (!Number.isInteger(sessionVersion) || sessionVersion < 0) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return { parentId, sessionVersion };
}

export async function setParentSessionCookie(parentId: number): Promise<void> {
  const store = await cookies();
  writeSessionCookie(
    store,
    PARENT_SESSION_COOKIE,
    await createParentSessionToken(parentId, await parentSessionVersion(parentId)),
    SESSION_MAX_AGE_SECONDS,
  );
}

export async function clearParentSessionCookie(): Promise<void> {
  const store = await cookies();
  clearSessionCookie(store, PARENT_SESSION_COOKIE);
}

/** ولي الأمر صاحب الجلسة الحالية، أو null إن لم يكن مسجّلاً */
export async function currentParent(): Promise<Parent | null> {
  const store = await cookies();
  const token = readSessionCookie(store, PARENT_SESSION_COOKIE);
  if (!token) return null;

  const session = await readParentSessionToken(token);
  if (session === null) return null;
  const parent = await findParentById(session.parentId);
  if (!parent || parent.sessionVersion !== session.sessionVersion) return null;
  // نشاط الحسابات: آخر ظهور (مكبوح ١٠ دقائق، صامت الفشل، بلا نسبة أثناء «عرض كـ»)
  await recordSeen({ role: "parent", parentId: parent.id });
  return parent;
}

/** رد موحّد لولي أمر غير مسجّل */
export function parentUnauthorized(): Response {
  return Response.json({ error: "يجب على ولي الأمر تسجيل الدخول أولاً" }, { status: 401 });
}
