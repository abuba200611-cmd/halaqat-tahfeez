import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { decideLink } from "@/lib/association-links-db";
import { logServerError } from "@/lib/dev-error-log";

/**
 * قبول/اعتذار مدير الجامع عن طلب ربط من جمعية (accept: true/false).
 * مدير الجامع المستهدف فقط: decideLink تقارن mosqueId الجلسة بجامع الطلب،
 * فمدير جامع آخر يحصل على 404 موحّد ولا يعرف إن كان الطلب موجوداً.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentMosqueAdmin();
  if (!admin) return Response.json({ error: "يجب تسجيل دخول مدير الجامع" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { accept?: unknown };
  if (typeof body.accept !== "boolean") return Response.json({ error: "القرار مطلوب" }, { status: 400 });

  try {
    const result = await decideLink(id, { kind: "mosque_admin", mosqueId: admin.mosqueId }, body.accept);
    if (!result.ok) {
      if (result.code === "already_decided") return Response.json({ error: "تم البتّ في هذا الطلب من قبل" }, { status: 409 });
      return Response.json({ error: "الطلب غير موجود" }, { status: 404 });
    }
    return Response.json({ ok: true, status: result.status });
  } catch (error) {
    await logServerError("mosque-admin:link-requests:decide", error);
    return Response.json({ error: "تعذّر حفظ القرار" }, { status: 500 });
  }
}
