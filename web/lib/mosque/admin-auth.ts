import "server-only";

import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/app/api/admin/login/route";
import { verifyAdminToken } from "@/lib/admin-session";
import { isDevConsoleRequest } from "@/lib/host-gate";

/*
  المشرف العام بنظام الجامع = لوحة الأدمن القائمة بهذا التطبيق نفسه
  (ADMIN_SECRET ← /api/admin/login ← كوكي admin_session بتوكن موقّع من
  lib/admin-session.ts). لا آلية ثانية هنا إطلاقاً — هذه الدوال مجرد
  غلاف يقرأ الجلسة نفسها، فمن يدخل لوحة الأدمن يدخل إدارة الجوامع
  تلقائياً وبالعكس.

  dev split: الجلسة نفسها لا وجود لها خارج مستضيج اللوحة — دخول الأدمن
  وتسجيل خروجه يجريان هناك، فأي طلب من مستضيج عام (حتى بكوكي منسوخ
  يدوياً) يُعامل بلا جلسة. هذا خط الدفاع الثاني خلف proxy.ts.
*/

/** هل جلسة الأدمن القائمة صالحة الآن؟ — تُستخدم داخل كل مسار محمي بنظام الجامع */
export async function isAdmin(): Promise<boolean> {
  if (!(await isDevConsoleRequest())) return false;
  const store = await cookies();
  const session = store.get(ADMIN_COOKIE)?.value;
  return !!session && verifyAdminToken(session);
}

export function unauthorized(): Response {
  return Response.json({ error: "غير مصرّح" }, { status: 401 });
}

/** يخرج المشرف العام: يحذف كوكي جلسة الأدمن نفسها (لوحة الاقتراحات ولوحة الجوامع جلسة واحدة) */
export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}
