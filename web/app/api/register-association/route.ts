import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { hashPassword } from "@/lib/mosque/password";
import { parseAssociationRegistrationBody } from "@/lib/association-registration";
import { createAssociationRegistrationRequest } from "@/lib/association-registration-db";
import { hasPrivacyConsent, privacyConsentRequired } from "@/lib/privacy-consent-shared";
import { recordPrivacyConsent } from "@/lib/privacy-consent";
import { logServerError } from "@/lib/dev-error-log";

/** طلبات لكل IP كل ساعة */
export const REGISTER_ASSOCIATION_MAX_PER_HOUR = 5;
const WINDOW_SECONDS = 60 * 60;

/**
 * طلب تسجيل جمعية عام (بلا حساب). يتحقق خادمياً من كل شيء، يجزّئ كلمة المرور
 * بالمجزّئ القائم، ويخزّن طلباً معلّقاً بانتظار موافقة المطوّر — لا ينشئ
 * جمعية ولا مديراً هنا أبداً.
 */
export async function POST(request: Request) {
  if (!(await checkRateLimit(`register-association:${clientIp(request)}`, REGISTER_ASSOCIATION_MAX_PER_HOUR, WINDOW_SECONDS))) {
    return rateLimited();
  }

  const body = await request.json().catch(() => ({}));
  if (!hasPrivacyConsent(body)) return privacyConsentRequired();
  const parsed = parseAssociationRegistrationBody(body);
  if (!parsed.ok) return Response.json({ error: parsed.error, field: parsed.field }, { status: 400 });

  try {
    const result = await createAssociationRegistrationRequest(parsed.value, hashPassword(parsed.value.password));
    if (!result.ok) {
      return Response.json({ error: "اسم المستخدم محجوز، اختر اسماً آخر", field: "username" }, { status: 409 });
    }
    await recordPrivacyConsent("association_request", result.id, clientIp(request));
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("register-association", error);
    return Response.json({ error: "تعذّر إرسال الطلب، حاول لاحقاً" }, { status: 500 });
  }
}
