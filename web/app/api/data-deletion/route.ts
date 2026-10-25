import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { createDeletionRequest, hasPendingDeletionRequest, DELETION_NOTE_MAX } from "@/lib/data-requests";
import { deletionIdentityFor, isDeletionKind } from "@/lib/data-deletion-identity";
import { logServerError } from "@/lib/dev-error-log";

/** حالة طلب الحذف للدور: ?kind=teacher → { pending: boolean } (401 بلا جلسة ذلك الدور) */
export async function GET(request: Request) {
  const kind = new URL(request.url).searchParams.get("kind");
  if (!isDeletionKind(kind)) return Response.json({ error: "دور غير صالح" }, { status: 400 });
  try {
    const identity = await deletionIdentityFor(kind);
    if (!identity) return Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    return Response.json({ pending: await hasPendingDeletionRequest(kind, identity.ref) });
  } catch (error) {
    await logServerError("data-deletion:status", error);
    return Response.json({ error: "تعذّر التحقق" }, { status: 500 });
  }
}

/**
 * «طلب حذف بياناتي»: يرفع طلباً إلى /dev/data-requests باسم صاحب الجلسة الحالية
 * للدور المذكور. الهوية تُشتق من الجلسة دائماً، ولا يُنفَّذ حذف آلياً.
 */
export async function POST(request: Request) {
  if (!(await checkRateLimit(`data-deletion:${clientIp(request)}`, 10, 60 * 60))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; note?: unknown };
  if (!isDeletionKind(body.kind)) return Response.json({ error: "دور غير صالح" }, { status: 400 });
  const note = typeof body.note === "string" ? body.note.trim().slice(0, DELETION_NOTE_MAX) : "";

  try {
    const identity = await deletionIdentityFor(body.kind);
    if (!identity) return Response.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 });
    const result = await createDeletionRequest({
      kind: body.kind,
      ref: identity.ref,
      displayName: identity.displayName,
      note,
    });
    return Response.json({ ok: true, alreadyPending: result.alreadyPending });
  } catch (error) {
    await logServerError("data-deletion:create", error);
    return Response.json({ error: "تعذّر رفع الطلب، حاول لاحقاً" }, { status: 500 });
  }
}
