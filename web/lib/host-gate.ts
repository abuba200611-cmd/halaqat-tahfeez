import "server-only";

import { headers } from "next/headers";
import { isDevConsoleHost, requestHost } from "./hosts";

/*
  حارس المستضيف الخادم (defense in depth خلف proxy.ts): حتى لو التُحمت
  قاعدة الاعتراض، تُرفض مسارات اللوحة هنا أيضاً إن جاء الطلب من مستضيف
  عام — بكوكي أدمن صحيح أو بلا. الردّ 404 لا 401/403 حتى لا يكشف ردّ
  مختلف عن وجود اللوحة أصلاً.
*/

/** هل طلب الدورة الحالية ورد من مستضيف لوحة المطوّر؟ */
export async function isDevConsoleRequest(): Promise<boolean> {
  return isDevConsoleHost(requestHost(await headers()));
}

/** رد 404 موحّد — نفس ما يُظهره proxy.ts للمسارات المحجوبة */
export function hostNotFound(): Response {
  return new Response(null, { status: 404 });
}

/**
 * بوابة مستضيف لمسارات الأدمن (/api/admin/*): null إن كان الطلب من
 * مستضيف اللوحة، وإلا رد 404 يوقف المسار فوراً.
 */
export async function devHostGate(): Promise<Response | null> {
  return (await isDevConsoleRequest()) ? null : hostNotFound();
}
