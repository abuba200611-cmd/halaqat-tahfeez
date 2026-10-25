import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/mosque/password";
import { parseMosqueRegistrationBody } from "@/lib/mosque-registration";
import { createRegistrationRequest } from "@/lib/mosque-registration-db";
import { logServerError } from "@/lib/dev-error-log";
import { hasPrivacyConsent, privacyConsentRequired } from "@/lib/privacy-consent-shared";
import { recordPrivacyConsent } from "@/lib/privacy-consent";

/** طلبات لكل IP كل ساعة — تقييد الإغراق دون إزعاج جامع يجرّب أكثر من مرة */
export const REGISTER_MOSQUE_MAX_PER_HOUR = 5;
const WINDOW_SECONDS = 60 * 60;

/**
 * طلب تسجيل جامع عام (بلا حساب). يتحقق من كل شيء خادمياً، يجزّئ كلمة المرور
 * بالمجزّئ القائم، ويخزّن طلباً معلّقاً بانتظار موافقة المطوّر — لا ينشئ
 * جامعاً ولا مديراً هنا أبداً.
 */
export async function POST(request: Request) {
  if (!(await checkRateLimit(`register-mosque:${clientIp(request)}`, REGISTER_MOSQUE_MAX_PER_HOUR, WINDOW_SECONDS))) {
    return rateLimited();
  }

  const body = await request.json().catch(() => ({}));
  if (!hasPrivacyConsent(body)) return privacyConsentRequired();
  const parsed = parseMosqueRegistrationBody(body);
  if (!parsed.ok) return Response.json({ error: parsed.error, field: parsed.field }, { status: 400 });

  try {
    const result = await createRegistrationRequest(parsed.value, hashPassword(parsed.value.password));
    if (!result.ok) {
      return Response.json({ error: "اسم المستخدم محجوز، اختر اسماً آخر", field: "username" }, { status: 409 });
    }
    await recordPrivacyConsent("mosque_request", result.id, clientIp(request));
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("register-mosque", error);
    return Response.json({ error: "تعذّر إرسال الطلب، حاول لاحقاً" }, { status: 500 });
  }
}
