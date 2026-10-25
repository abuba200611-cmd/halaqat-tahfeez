import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findMosqueAdminById, findTeacherById, sessionSecret } from "./db";
import { createSessionToken, SESSION_COOKIE } from "./auth";
import { createMosqueAdminSessionToken, MOSQUE_ADMIN_SESSION_COOKIE } from "./mosque-auth";
import { getMosque } from "./mosque/db";
import {
  clearSessionCookie,
  readSessionCookie,
  writeSessionCookie,
} from "./session-cookie";

/*
  M3 — «عرض كـ»: يفتح المطوّر (جلسة الأدمن) جلسة قصيرة بدور معلّم أو مدير
  جامع لفحص الشاشات بعين ذلك الدور. الكوكي dev_imp هو الادعاء الموقَّع
  imp=1 + معرّف الأدمن: كل صفحات/مسارات النظام تراه فيقرأ الشريطَ الأحمر
  الثابت، والمسارات الهدّامة ترفض طلباته (guardImpersonation أدناه).
  صلاحيته ١٥ دقيقة فقط، مستقلة عن صلاحية جلسة الأدمن نفسها.
*/

export const IMPERSONATION_COOKIE = "dev_imp";
export const IMPERSONATION_MAX_AGE_SECONDS = 15 * 60;

export type ImpersonationKind = "teacher" | "mosque_admin";

export type ImpersonationInfo = {
  kind: ImpersonationKind;
  targetId: number;
  adminId: number;
  issuedAt: number;
  expiresAt: number;
  /** تسمية الهدف للشريط الأحمر — تُحلّ من قاعدة البيانات عند البدء فقط */
  label?: string;
};

async function sign(payload: string): Promise<string> {
  return createHmac("sha256", await sessionSecret()).update(payload).digest("hex");
}

export async function createImpersonationToken(
  kind: ImpersonationKind,
  targetId: number,
  adminId: number,
): Promise<{ token: string; expiresAt: number }> {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + IMPERSONATION_MAX_AGE_SECONDS * 1000;
  const payload = `imp.${kind}.${targetId}.${adminId}.${issuedAt}.${expiresAt}`;
  return { token: `${payload}.${await sign(payload)}`, expiresAt };
}

/**
 * يتحقق من الوسم والتوقيع والصلاحية، ويرجع ادعاء «عرض كـ» أو null.
 * allowExpired يُستخدم عند «إنهاء» فقط: حتى لو انتهت الـ١٥ دقيقة نحتاج
 * معرفة الدور لنحذف كوكي الجلسة المنتحَلة الصحيح.
 */
export async function readImpersonationToken(
  token: string,
  allowExpired = false,
): Promise<ImpersonationInfo | null> {
  const parts = token.split(".");
  if (parts.length !== 7) return null;
  const [tag, kind, targetPart, adminPart, issuedPart, expiresPart, signature] = parts;
  if (tag !== "imp" || (kind !== "teacher" && kind !== "mosque_admin")) return null;

  const expected = await sign(`${tag}.${kind}.${targetPart}.${adminPart}.${issuedPart}.${expiresPart}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const targetId = Number(targetPart);
  const adminId = Number(adminPart);
  const issuedAt = Number(issuedPart);
  const expiresAt = Number(expiresPart);
  if (!Number.isInteger(targetId) || !Number.isInteger(adminId)) return null;
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) return null;
  if (!allowExpired && Date.now() > expiresAt) return null;

  return { kind, targetId, adminId, issuedAt, expiresAt };
}

/** ادعاء «عرض كـ» الفعّال الآن (كوكي صحيح غير منتهٍ)، أو null */
export async function currentImpersonation(): Promise<ImpersonationInfo | null> {
  const store = await cookies();
  const token = store.get(IMPERSONATION_COOKIE)?.value;
  if (!token) return null;
  return readImpersonationToken(token);
}

/** 403 موحّد لكل مسار هدّام أثناء «عرض كـ» — يستدعي guardImpersonation */
export function impersonationBlocked(): Response {
  return Response.json(
    { error: "هذا الإجراء غير متاح أثناء «عرض كـ» — أنهِ العرض أولاً" },
    { status: 403 },
  );
}

/**
 * حارس المسارات الهدّامة: يرجع رد 403 إن كانت جلسة الحالية انتحالاً
 * («عرض كـ» فعّال)، أو null لو الطلب عادي فيكمل المسار.
 */
export async function guardImpersonation(): Promise<Response | null> {
  return (await currentImpersonation()) ? impersonationBlocked() : null;
}

/**
 * يبدأ «عرض كـ»: يضبط كوكي جلسة الدور الحقيقي (معلّم/مدير جامع) + كوكي
  الادعاء dev_imp. جلسة الأدمن نفسها لا تُمسّ، فيعود إليها بـ«إنهاء».
 */
export async function startImpersonation(kind: ImpersonationKind, targetId: number, adminId: number): Promise<string | null> {
  const store = await cookies();
  let label: string;

  if (kind === "teacher") {
    const teacher = await findTeacherById(targetId);
    if (!teacher || teacher.deactivatedAt) return null;
    label = teacher.teacherName || teacher.username;
    store.set(SESSION_COOKIE, await createSessionToken(teacher.id, teacher.sessionVersion), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // كوكي الدور أيضاً بلا عمر أطول من نافذة الانتحال — ينتهي معها
      maxAge: IMPERSONATION_MAX_AGE_SECONDS,
    });
  } else {
    const mosqueAdmin = await findMosqueAdminById(targetId);
    if (!mosqueAdmin) return null;
    const mosque = await getMosque(mosqueAdmin.mosqueId);
    label = `${mosqueAdmin.username} — ${mosque?.name ?? ""}`;
    store.set(MOSQUE_ADMIN_SESSION_COOKIE, await createMosqueAdminSessionToken(mosqueAdmin.id, mosqueAdmin.sessionVersion ?? 0), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: IMPERSONATION_MAX_AGE_SECONDS,
    });
  }

  const { token } = await createImpersonationToken(kind, targetId, adminId);
  store.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
  });
  return label;
}

/**
 * ينهي «عرض كـ»: يحذف كوكي الادعاء وكوكي جلسة الدور المنتحَل. يقبل
 * الادعاء حتى منتهياً (allowExpired) لمعرفة أي كوكي دور يُحذف.
 */
export async function endImpersonation(): Promise<ImpersonationInfo | null> {
  const store = await cookies();
  const token = store.get(IMPERSONATION_COOKIE)?.value;
  if (!token) return null;

  const info = await readImpersonationToken(token, true);
  store.delete(IMPERSONATION_COOKIE);
  if (info?.kind === "teacher") store.delete(SESSION_COOKIE);
  if (info?.kind === "mosque_admin") store.delete(MOSQUE_ADMIN_SESSION_COOKIE);
  return info;
}

/** تسمية هدف «عرض كـ» لعرضها بالشريط الأحمر — من القاعدة وقت العرض */
export async function impersonationLabel(info: ImpersonationInfo): Promise<string> {
  if (info.kind === "teacher") {
    const teacher = await findTeacherById(info.targetId);
    return teacher ? teacher.teacherName || teacher.username : `معلّم #${info.targetId}`;
  }
  const mosqueAdmin = await findMosqueAdminById(info.targetId);
  if (!mosqueAdmin) return `مدير جامع #${info.targetId}`;
  const mosque = await getMosque(mosqueAdmin.mosqueId);
  return `${mosqueAdmin.username} — ${mosque?.name ?? ""}`;
}
