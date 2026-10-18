import { createHash, randomInt } from "node:crypto";
import { whatsappProvider } from "./whatsapp";

/*
  رمز تأكيد ملكية رقم واتساب (B1): 6 أرقام عشوائية آمنة تُرسل للرقم نفسه
  بقالب halaqa_optin_confirm، ويُخزَّن مجزّأً فقط (لا يُحفظ الرمز الخام).
  التجزئة تشمل معرّف الولي والرقم فلا يصلح رمز ولي أو رقم لآخر.
*/

export const OPTIN_CODE_TTL_MINUTES = 10;
export const OPTIN_CODE_MAX_ATTEMPTS = 5;
export const PHONE_CHANGES_PER_DAY = 3;

export function generateOptinCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashOptinCode(parentId: number, phone: string, code: string): string {
  return createHash("sha256").update(`${parentId}:${phone}:${code}`).digest("hex");
}

/** يرسل رمز التأكيد — sent، أو skipped (مزوّد غير مهيأ)، أو failed. لا يرمي أبداً. */
export async function sendOptinCode(phone: string, code: string): Promise<"sent" | "skipped" | "failed"> {
  const result = await whatsappProvider().send({ to: phone, template: "optin_confirm", params: { code } });
  if (result.skipped) return "skipped";
  return result.error ? "failed" : "sent";
}
