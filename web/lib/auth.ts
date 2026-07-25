import "server-only";

import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { findStudentAccount, findTeacherById, sessionSecret, type Teacher } from "./db";
import type { StudentAccount } from "./types";

export const SESSION_COOKIE = "halaqa_session";
export const STUDENT_SESSION_COOKIE = "halaqa_student";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // ٣٠ يوماً

/** تجزئة كلمة المرور بـ scrypt — مدمج في Node، فلا حاجة لمكتبة خارجية */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;

  const expected = Buffer.from(expectedHex, "hex");
  const candidate = scryptSync(password, salt, expected.length);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("hex");
}

export function createSessionToken(teacherId: number): string {
  const payload = `${teacherId}.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** يتحقق من التوقيع والصلاحية، ويرجع معرّف المعلّم أو null */
export function readSessionToken(token: string): number | null {
  const [idPart, issuedPart, signature] = token.split(".");
  if (!idPart || !issuedPart || !signature) return null;

  const expected = sign(`${idPart}.${issuedPart}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const issuedAt = Number(issuedPart);
  const teacherId = Number(idPart);
  if (!Number.isFinite(issuedAt) || !Number.isInteger(teacherId)) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;

  return teacherId;
}

export async function setSessionCookie(teacherId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(teacherId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** المعلّم صاحب الجلسة الحالية، أو null إن لم يكن مسجّلاً */
export async function currentTeacher(): Promise<Teacher | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const teacherId = readSessionToken(token);
  return teacherId === null ? null : findTeacherById(teacherId);
}

/** رد موحّد لمن ليس مسجّل الدخول */
export function unauthorized(): Response {
  return Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
}

// ————— جلسة الطالب —————
// كوكي منفصل عن المعلّم حتى يمكن أن يكون الجهاز مسجّلاً بالدورين معاً دون تعارض.
// الحمولة تحمل معرّف المعلّم ومعرّف الطالب (مُرمّزاً base64url لأنه نصّ قد يحوي أي محرف).

function studentPayload(teacherId: number, studentId: string, issuedAt: number): string {
  const encodedId = Buffer.from(studentId).toString("base64url");
  return `student.${teacherId}.${encodedId}.${issuedAt}`;
}

export function createStudentSessionToken(teacherId: number, studentId: string): string {
  const payload = studentPayload(teacherId, studentId, Date.now());
  return `${payload}.${sign(payload)}`;
}

/** يتحقق من التوقيع والصلاحية، ويرجع (المعلّم، الطالب) أو null */
export function readStudentSessionToken(
  token: string,
): { teacherId: number; studentId: string } | null {
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [tag, idPart, encodedId, issuedPart, signature] = parts;
  if (tag !== "student") return null;

  const expected = sign(`${tag}.${idPart}.${encodedId}.${issuedPart}`);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;

  const issuedAt = Number(issuedPart);
  const teacherId = Number(idPart);
  if (!Number.isFinite(issuedAt) || !Number.isInteger(teacherId)) return null;
  if (Date.now() - issuedAt > SESSION_MAX_AGE_SECONDS * 1000) return null;

  const studentId = Buffer.from(encodedId, "base64url").toString();
  if (!studentId) return null;
  return { teacherId, studentId };
}

export async function setStudentSessionCookie(
  teacherId: number,
  studentId: string,
): Promise<void> {
  const store = await cookies();
  store.set(STUDENT_SESSION_COOKIE, createStudentSessionToken(teacherId, studentId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearStudentSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(STUDENT_SESSION_COOKIE);
}

/** الطالب صاحب الجلسة الحالية، أو null إن لم يكن مسجّلاً */
export async function currentStudent(): Promise<StudentAccount | null> {
  const store = await cookies();
  const token = store.get(STUDENT_SESSION_COOKIE)?.value;
  if (!token) return null;

  const parsed = readStudentSessionToken(token);
  return parsed === null ? null : findStudentAccount(parsed.teacherId, parsed.studentId);
}

/** رد موحّد لطالب غير مسجّل */
export function studentUnauthorized(): Response {
  return Response.json({ error: "يجب على الطالب تسجيل الدخول أولاً" }, { status: 401 });
}
