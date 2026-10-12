import { hashPassword } from "@/lib/auth";
import { setParentSessionCookie } from "@/lib/parent-auth";
import { createParent, isValidParentEmail, normalizeParentEmail } from "@/lib/parent-db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** إنشاء حساب ولي أمر (الاسم + البريد + كلمة المرور) ثم تسجيل دخوله مباشرة */
export async function POST(request: Request) {
  // حدّ إنشاء الحسابات لكل IP — ١٠ كل ساعة، يكفي أسرة حقيقية ويكبح الإغراق
  if (!(await checkRateLimit(`parent-register:${clientIp(request)}`, 10, 3600))) {
    return rateLimited();
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? "").trim().slice(0, 80);
  const email = normalizeParentEmail(String(body.email ?? ""));
  const password = String(body.password ?? "");

  if (!name) return Response.json({ error: "الاسم مطلوب" }, { status: 400 });
  if (!isValidParentEmail(email)) return Response.json({ error: "البريد الإلكتروني غير صحيح" }, { status: 400 });
  if (password.length < 8 || password.length > 200) {
    return Response.json({ error: "كلمة المرور ٨ أحرف على الأقل" }, { status: 400 });
  }

  const id = await createParent(email, name, hashPassword(password));
  if (id === null) {
    return Response.json({ error: "هذا البريد مسجّل مسبقاً — سجّل الدخول بدلاً من ذلك" }, { status: 409 });
  }

  await setParentSessionCookie(id);
  return Response.json({ parent: { id, name, email } });
}
