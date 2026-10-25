import { currentAssociationAdmin } from "@/lib/association-auth";
import { decideLink } from "@/lib/association-links-db";
import { logServerError } from "@/lib/dev-error-log";

/**
 * قرار الجمعية في طلب ربط أرسله جامع جديد عند تسجيله (accept: true/false).
 * الصلاحية تُحسم في decideLink: الجمعية المستهدفة نفسها فقط، وإلا 404 موحّد.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await currentAssociationAdmin();
  if (!admin) return Response.json({ error: "يجب تسجيل دخول مدير الجمعية" }, { status: 401 });

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "معرّف غير صالح" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { accept?: unknown };
  if (typeof body.accept !== "boolean") return Response.json({ error: "القرار مطلوب" }, { status: 400 });

  try {
    const result = await decideLink(id, { kind: "association_admin", associationId: admin.associationId }, body.accept);
    if (!result.ok) {
      if (result.code === "already_decided") return Response.json({ error: "تم البتّ في هذا الطلب من قبل" }, { status: 409 });
      return Response.json({ error: "الطلب غير موجود" }, { status: 404 });
    }
    return Response.json({ ok: true, status: result.status });
  } catch (error) {
    await logServerError("association:link-requests:decide", error);
    return Response.json({ error: "تعذّر حفظ القرار" }, { status: 500 });
  }
}
