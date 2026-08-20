import "server-only";

/*
  إرسال بريد عبر Resend — نداء REST مباشر بدون مكتبة إضافية (الحمولة
  بسيطة ولا تستحق تبعية جديدة). ملاحظة تشغيلية مهمة: بدون تحقّق نطاق
  مخصّص على Resend، حساب Resend المجاني يرسل فقط من onboarding@resend.dev
  وإلى البريد الذي أنشأت به الحساب — أي رسالة لغيره تُرفض صامتة حتى
  يُضاف نطاق ويُتحقّق منه. راجع resend.com/domains.
*/

const FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
