import "server-only";

import { createHmac } from "node:crypto";
import { expectedAdminSecret, safeEqual } from "./safe-equal";

/*
  توكن جلسة الأدمن — الكوكي لا يحمل ADMIN_SECRET الخام أبداً (تسريبه من
  المتصفح/البروكسي = تسريب السرّ نفسه)، بل توكن موقّع HMAC صالح ١٢ ساعة.
*/

const ADMIN_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function createAdminToken(): string {
  const payload = `admin.${Date.now()}`;
  const hmac = createHmac("sha256", expectedAdminSecret()).update(payload).digest("hex");
  return `${payload}.${hmac}`;
}

export function verifyAdminToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "admin") return false;

  const issuedAt = Number(parts[1]);
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > ADMIN_SESSION_MAX_AGE_MS) return false;

  const secret = expectedAdminSecret();
  if (!secret) return false;

  const expected = createHmac("sha256", secret).update(`admin.${parts[1]}`).digest("hex");
  return safeEqual(parts[2], expected);
}
