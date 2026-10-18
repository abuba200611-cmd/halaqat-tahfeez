import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { normalizeSaudiPhone } from "@/lib/notify/phone";
import { getParentWhatsappInfo, setParentWhatsappOptIn, setParentWhatsappPhone } from "@/lib/parent-db";

/*
  B1 — إعدادات واتساب لولي الأمر: رقم الجوال والموافقة الصريحة. الرقم
  يُطبَّع هنا (E.164 سعودي) قبل الحفظ، وتغييره يُسقط الموافقة (تُطلب من
  جديد عند الرقم الجديد)، ولا تُقبل موافقة بلا رقم محفوظ.
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

  if (body.phone !== undefined && body.phone !== null) {
    const phone = normalizeSaudiPhone(String(body.phone));
    if (phone === null) {
      return Response.json({ error: "أدخل رقم جوال سعودي صحيح مثل 05xxxxxxxx" }, { status: 400 });
    }
    await setParentWhatsappPhone(parent.id, phone);
  }

  if (typeof body.optIn === "boolean") {
    const changed = await setParentWhatsappOptIn(parent.id, body.optIn);
    if (!changed) {
      return Response.json({ error: "أضف رقم الجوال أولاً قبل الموافقة على الرسائل" }, { status: 400 });
    }
  }

  return Response.json(await getParentWhatsappInfo(parent.id));
}
