/*
  موافقة سياسة الخصوصية — جزء نقي يشاركه العميل والخادم والاختبارات.
  الموافقة صريحة: الخادم يرفض أي تسجيل لا يحمل privacyConsent === true
  حرفياً (لا يكفي وجود الحقل ولا قيمة truthy).
*/

/** نسخة السياسة التي وافق عليها المستخدم — تُرفع عند أي تعديل جوهري في /privacy */
export const PRIVACY_POLICY_VERSION = "2026-11";

export const PRIVACY_CONSENT_LABEL = "أوافق على سياسة الخصوصية";
export const PRIVACY_CONSENT_REQUIRED_MESSAGE = "الموافقة على سياسة الخصوصية مطلوبة لإكمال التسجيل";

/** هل يحمل جسم الطلب موافقة صريحة؟ */
export function hasPrivacyConsent(body: unknown): boolean {
  return typeof body === "object" && body !== null && (body as Record<string, unknown>).privacyConsent === true;
}

/** ردّ موحّد لتسجيل بلا موافقة */
export function privacyConsentRequired(): Response {
  return Response.json({ error: PRIVACY_CONSENT_REQUIRED_MESSAGE, field: "privacyConsent" }, { status: 400 });
}
