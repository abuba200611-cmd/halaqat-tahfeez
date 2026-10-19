import "server-only";

import { normalizeDisplayName } from "@/lib/account-settings";
import { clientIp } from "@/lib/client-ip";
import { guardImpersonation } from "@/lib/dev-impersonation";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/*
  تعديل اسم العرض من الإعدادات — منطق واحد لكل دور له عمود اسم. المعرّف
  يأتي من جلسة الدور حصراً (sessionId) ولا يُقرأ أي معرّف من جسم الطلب؛
  حقل `name` فقط. الحدّ: لكل جلسة ولكل IP.
*/

const SESSION_LIMIT = 10;
const IP_LIMIT = 40;
const WINDOW_SECONDS = 10 * 60;

export async function handleNameChange(
  request: Request,
  target: { scope: string; sessionId: number; apply: (name: string) => Promise<void> },
): Promise<Response> {
  const impBlocked = await guardImpersonation();
  if (impBlocked) return impBlocked;

  const sessionOk = await checkRateLimit(`name:${target.scope}:${target.sessionId}`, SESSION_LIMIT, WINDOW_SECONDS);
  const ipOk = await checkRateLimit(`name-ip:${clientIp(request)}`, IP_LIMIT, WINDOW_SECONDS);
  if (!sessionOk || !ipOk) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { name?: unknown };
  const result = normalizeDisplayName(body.name);
  if (!result.ok) return Response.json({ error: result.error }, { status: 400 });

  await target.apply(result.name);
  return Response.json({ ok: true, name: result.name });
}
