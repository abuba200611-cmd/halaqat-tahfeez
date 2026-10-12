import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { saveParentPushSubscription } from "@/lib/parent-db";
import { getVapidPublicKey } from "@/lib/push";
import { isAllowedPushEndpoint } from "@/lib/push-endpoint";

/** المفتاح العام لـVAPID — نفس زوج المفاتيح الواحد للتطبيق كله */
export async function GET() {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return Response.json({ error: "الإشعارات غير متاحة" }, { status: 503 });
  return Response.json({ publicKey });
}

/** حفظ اشتراك جهاز ولي الأمر — هويته من الجلسة حصراً، وendpoint يمرّ بقائمة السماح */
export async function POST(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  try {
    const body = (await request.json()) as { subscription?: unknown };
    const sub = body.subscription as
      | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
      | undefined;

    const endpoint = String(sub?.endpoint ?? "").trim();
    const p256dh = String(sub?.keys?.p256dh ?? "").trim();
    const auth = String(sub?.keys?.auth ?? "").trim();
    if (!endpoint || !p256dh || !auth) throw new Error("بيانات الاشتراك ناقصة");
    if (!isAllowedPushEndpoint(endpoint)) throw new Error("عنوان خدمة الإشعارات غير مدعوم");

    await saveParentPushSubscription(parent.id, { endpoint, p256dh, auth });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر تفعيل الإشعارات" },
      { status: 400 },
    );
  }
}
