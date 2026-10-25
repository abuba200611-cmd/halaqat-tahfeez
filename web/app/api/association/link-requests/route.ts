import { currentAssociationAdmin } from "@/lib/association-auth";
import { listLinksForAssociation, requestMosqueLink, searchMosquesForLink } from "@/lib/association-links-db";
import { logServerError } from "@/lib/dev-error-log";

function unauthorized(): Response {
  return Response.json({ error: "يجب تسجيل دخول مدير الجمعية" }, { status: 401 });
}

/**
 * GET: طلبات ربط جمعية الجلسة. مع ?q= (حرفان فأكثر): بحث بالاسم عن جوامع
 * يمكن إرسال «ربط جامع» إليها. معرّف الجمعية يأتي من الجلسة دائماً.
 */
export async function GET(request: Request) {
  const admin = await currentAssociationAdmin();
  if (!admin) return unauthorized();

  try {
    const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (q) {
      if (q.length < 2 || q.length > 60) return Response.json({ mosques: [] });
      return Response.json({ mosques: await searchMosquesForLink(admin.associationId, q) });
    }
    return Response.json({ links: await listLinksForAssociation(admin.associationId) });
  } catch (error) {
    await logServerError("association:link-requests:get", error);
    return Response.json({ error: "تعذّر التحميل" }, { status: 500 });
  }
}

const MESSAGES = {
  mosque_not_found: ["الجامع غير موجود", 404],
  already_linked: ["هذا الجامع مرتبط بجمعيتكم أصلاً", 409],
  already_pending: ["يوجد طلب ربط معلّق لهذا الجامع", 409],
} as const;

/** «ربط جامع»: يرسل طلباً معلّقاً لجامع قائم، يقبله مدير ذلك الجامع من إعداداته */
export async function POST(request: Request) {
  const admin = await currentAssociationAdmin();
  if (!admin) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { mosqueId?: unknown };
  const mosqueId = body.mosqueId;
  if (typeof mosqueId !== "number" || !Number.isSafeInteger(mosqueId) || mosqueId <= 0) {
    return Response.json({ error: "معرّف الجامع غير صالح" }, { status: 400 });
  }

  try {
    const result = await requestMosqueLink(admin.associationId, mosqueId);
    if (!result.ok) {
      const [error, status] = MESSAGES[result.code];
      return Response.json({ error, code: result.code }, { status });
    }
    return Response.json({ ok: true, id: result.id });
  } catch (error) {
    await logServerError("association:link-requests:post", error);
    return Response.json({ error: "تعذّر إرسال الطلب" }, { status: 500 });
  }
}
