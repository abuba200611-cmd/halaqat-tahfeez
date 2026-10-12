import "server-only";

import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/app/api/admin/login/route";
import { verifyAdminToken } from "@/lib/admin-session";

/*
  المشرف العام بنظام الجامع = لوحة الأدمن القائمة بهذا التطبيق نفسه
  (ADMIN_SECRET ← /api/admin/login ← كوكي admin_session بتوكن موقّع من
  lib/admin-session.ts). لا آلية ثانية هنا إطلاقاً — هذه الدوال مجرد
  غلاف يقرأ الجلسة نفسها، فمن يدخل لوحة الأدمن يدخل إدارة الجوامع
  تلقائياً وبالعكس.
*/

/** هل جلسة الأدمن القائمة صالحة الآن؟ — تُستخدم داخل كل مسار محمي بنظام الجامع */
export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const session = store.get(ADMIN_COOKIE)?.value;
  return !!session && verifyAdminToken(session);
}

export function unauthorized(): Response {
  return Response.json({ error: "غير مصرّح" }, { status: 401 });
}
