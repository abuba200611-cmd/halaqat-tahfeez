import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { deleteParentPushSubscription } from "@/lib/parent-db";

/** إلغاء اشتراك جهاز ولي الأمر — الحذف مقفول على هوية الجلسة */
export async function DELETE(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  const body = (await request.json().catch(() => ({}))) as { endpoint?: unknown };
  const endpoint = String(body.endpoint ?? "").trim();
  if (endpoint) await deleteParentPushSubscription(parent.id, endpoint);
  return Response.json({ ok: true });
}
