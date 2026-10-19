import "server-only";

import { hashPassword, verifyPassword } from "@/lib/auth";
import { clientIp } from "@/lib/client-ip";
import { guardImpersonation } from "@/lib/dev-impersonation";
import { hasLocalPassword, validatePasswordChange } from "@/lib/account-settings";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/*
  تغيير كلمة المرور من داخل الحساب — منطق واحد لكل الأدوار التي تدخل بكلمة
  مرور (معلّم/ولي أمر/مدير جامع/مدير جمعية). المسار الرقيق يمرّر هوية
  الجلسة وقارئ البصمة ومُنفّذ التحديث؛ أي معرّف لا يأتي من العميل أبداً.
  الحدّ: لكل جلسة ولكل IP (يُحتسب كل طلب فيمنع التخمين المتتابع للحالية).
*/

const SESSION_LIMIT = 5;
const IP_LIMIT = 20;
const WINDOW_SECONDS = 15 * 60;

export type PasswordChangeTarget = {
  /** وسم الدور في مفتاح الحدّ: teacher | parent | mosque-admin | association */
  scope: string;
  /** معرّف الحساب من الجلسة حصراً */
  sessionId: number;
  /** البصمة المخزّنة الحالية */
  loadHash: () => Promise<string | null>;
  /** يخزّن البصمة الجديدة (ويرفع نسخة الجلسة إن وُجدت آلية) ثم يعيد إصدار كوكي الجلسة الحالية */
  apply: (newHash: string) => Promise<void>;
};

export async function handlePasswordChange(request: Request, target: PasswordChangeTarget): Promise<Response> {
  // تغيير كلمة المرور هدّام — ممنوع أثناء «عرض كـ»
  const impBlocked = await guardImpersonation();
  if (impBlocked) return impBlocked;

  const ip = clientIp(request);
  const sessionOk = await checkRateLimit(`pwchange:${target.scope}:${target.sessionId}`, SESSION_LIMIT, WINDOW_SECONDS);
  const ipOk = await checkRateLimit(`pwchange-ip:${ip}`, IP_LIMIT, WINDOW_SECONDS);
  if (!sessionOk || !ipOk) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const checked = validatePasswordChange(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });

  const stored = await target.loadHash();
  if (!hasLocalPassword(stored)) {
    return Response.json(
      { error: "كلمة المرور مُدارة من جوجل — لا يوجد ما يُغيَّر هنا", code: "google_only" },
      { status: 400 },
    );
  }
  if (!verifyPassword(checked.input.current, stored as string)) {
    return Response.json({ error: "كلمة المرور الحالية غير صحيحة" }, { status: 403 });
  }

  await target.apply(hashPassword(checked.input.next));
  return Response.json({ ok: true });
}

/** هل لهذا الحساب كلمة مرور محلية؟ — لواجهة الإعدادات (تعرض الملاحظة بدل النموذج) */
export function passwordInfoResponse(stored: string | null): Response {
  return Response.json({ hasPassword: hasLocalPassword(stored) });
}
