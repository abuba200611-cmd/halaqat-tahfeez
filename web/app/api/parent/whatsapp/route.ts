import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { normalizeSaudiPhone } from "@/lib/notify/phone";
import {
  OPTIN_CODE_MAX_ATTEMPTS,
  OPTIN_CODE_TTL_MINUTES,
  PHONE_CHANGES_PER_DAY,
  generateOptinCode,
  hashOptinCode,
  sendOptinCode,
} from "@/lib/notify/optin";
import {
  confirmParentWhatsappCode,
  disableParentWhatsappOptIn,
  getParentWhatsappInfo,
  setParentWhatsappPhone,
} from "@/lib/parent-db";

/*
  B1 — إعدادات واتساب لولي الأمر: رقم الجوال والموافقة الصريحة. الرقم
  يُطبَّع هنا (E.164 سعودي) قبل الحفظ، وتغييره يُسقط الموافقة ويرسل رمز
  تأكيد من 6 أرقام للرقم نفسه (القالب halaqa_optin_confirm). الموافقة لا
  تُفعَّل إلا بإدخال الرمز الصحيح (صالح 10 دقائق، 5 محاولات) فلا يمكن
  تفعيلها على رقم شخص آخر. تغيير الرقم محدود بـ3 باليوم لكل ولي.
*/

/** حالة واتساب الحالية لولي الأمر من جلسته */
export async function GET() {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();
  return Response.json(await getParentWhatsappInfo(parent.id));
}

/** حفظ الرقم و/أو تفعيل الموافقة أو إيقافها */
export async function PUT(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();
  if (!(await checkRateLimit(`parent-whatsapp:${parent.id}`, 30, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  let codeDelivery: "sent" | "skipped" | "failed" | undefined;

  if (body.phone !== undefined && body.phone !== null) {
    const phone = normalizeSaudiPhone(String(body.phone));
    if (phone === null) {
      return Response.json({ error: "أدخل رقم جوال سعودي صحيح مثل 05xxxxxxxx" }, { status: 400 });
    }
    const code = generateOptinCode();
    const saved = await setParentWhatsappPhone(
      parent.id,
      phone,
      hashOptinCode(parent.id, phone, code),
      PHONE_CHANGES_PER_DAY,
      OPTIN_CODE_TTL_MINUTES,
    );
    if (!saved) {
      return Response.json(
        { error: `بلغت حدّ تغيير الرقم اليوم (${PHONE_CHANGES_PER_DAY} مرات) — حاول غداً` },
        { status: 429 },
      );
    }
    codeDelivery = await sendOptinCode(phone, code);
  }

  // التفعيل لا يمرّ إلا برمز التأكيد — لا optIn:true مجرّد أبداً
  if (body.optIn === true) {
    return Response.json({ error: "أدخل رمز التأكيد المرسل إلى واتساب لتفعيل الرسائل" }, { status: 400 });
  }

  if (body.code !== undefined && body.code !== null) {
    const code = String(body.code).trim();
    if (!/^\d{6}$/.test(code)) {
      return Response.json({ error: "رمز التأكيد 6 أرقام" }, { status: 400 });
    }
    const outcome = await confirmParentWhatsappCode(
      parent.id,
      code,
      (phone, given) => hashOptinCode(parent.id, phone, given),
      OPTIN_CODE_MAX_ATTEMPTS,
    );
    if (outcome !== "ok") {
      const messages = {
        invalid: "الرمز غير صحيح",
        expired: "انتهت صلاحية الرمز — احفظ الرقم مجدداً لإرسال رمز جديد",
        locked: "استُنفدت محاولات الرمز — احفظ الرقم مجدداً لإرسال رمز جديد",
        none: "لا رمز بانتظار التأكيد — احفظ رقمك أولاً",
      } as const;
      return Response.json({ error: messages[outcome] }, { status: 400 });
    }
  }

  if (body.optIn === false) {
    await disableParentWhatsappOptIn(parent.id);
  }

  const info = await getParentWhatsappInfo(parent.id);
  return Response.json(codeDelivery ? { ...info, codeDelivery } : info);
}
