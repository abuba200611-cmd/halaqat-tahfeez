import "server-only";

import nodemailer from "nodemailer";

/*
  إرسال بريد — مسار Gmail SMTP أولاً إن ضُبطت بيانات اعتماده
  (GMAIL_USER + GMAIL_APP_PASSWORD)، وإلا Resend كما كان (STEP 38 —
  حل مؤقت يتيح استلام بريد التحقق فوراً لأي بريد حقيقي [Gmail،
  Outlook، ...] بلا حاجة لنطاق Resend موثّق؛ الخطة الدائمة تُحسم
  لاحقاً). لو فشل إرسال SMTP فعلياً (بيانات اعتماد خاطئة، اتصال
  متعذّر) نحاول Resend بعده كمحاولة أخيرة بدل الفشل الفوري — بلا كسر
  أي مسار قائم.

  ملاحظة تشغيلية عن Resend (لم تتغيّر): بدون تحقّق نطاق مخصّص، حساب
  Resend المجاني يرسل فقط من onboarding@resend.dev وإلى البريد الذي
  أنشأت به الحساب — أي رسالة لغيره تُرفض صامتة حتى يُضاف نطاق ويُتحقّق
  منه. راجع resend.com/domains.
*/

const RESEND_FROM = process.env.RESEND_FROM ?? "onboarding@resend.dev";

let smtpTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

/** ينشئ ناقل SMTP مرة واحدة ويعيد استخدامه، أو null لو بيانات الاعتماد غير مضبوطة */
function getSmtpTransport(): ReturnType<typeof nodemailer.createTransport> | null {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true, // true لمنفذ 465 (TLS مباشر)؛ لمنفذ 587 يلزم secure:false + STARTTLS تلقائي
      auth: { user, pass },
    });
  }
  return smtpTransport;
}

async function sendViaSmtp(to: string, subject: string, html: string): Promise<boolean> {
  const transport = getSmtpTransport();
  if (!transport) return false;

  try {
    await transport.sendMail({ from: process.env.GMAIL_USER, to, subject, html });
    return true;
  } catch {
    return false;
  }
}

async function sendViaResend(to: string, subject: string, html: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    if (await sendViaSmtp(to, subject, html)) return true;
  }
  return sendViaResend(to, subject, html);
}
