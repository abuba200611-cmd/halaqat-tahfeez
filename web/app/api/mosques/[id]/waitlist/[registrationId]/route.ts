import { paramNotFound, parsePositiveIntParam } from "@/lib/mosque/api-gate";
import { enrollmentGate, enrollmentWriteGuard } from "@/lib/enrollment-api";
import { moveWaitlistEntry, removeWaitlistEntry } from "@/lib/mosque/enrollment-db";
import { logServerError } from "@/lib/dev-error-log";

/*
  إدارة منتظر واحد: POST { action: "move", direction: "up"|"down" } لإعادة الترتيب،
  و DELETE لإزالته. (الإسناد اليدوي لحلقة يمرّ على /api/assign الموجود، وهو يتجاوز السعة
  عمداً — قرار المدير.) التسجيل يُقيَّد بجامع المسار فلا يمسّ منتظر جامع آخر.
*/
export async function POST(request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  const { id, registrationId: rawRegistrationId } = await params;
  const ctx = await enrollmentGate(id);
  if (ctx instanceof Response) return ctx;
  const registrationId = parsePositiveIntParam(rawRegistrationId);
  if (registrationId === null) return paramNotFound();

  const body = (await request.json().catch(() => ({}))) as { action?: unknown; direction?: unknown };
  if (body.action !== "move" || (body.direction !== "up" && body.direction !== "down")) {
    return Response.json({ error: "إجراء غير معروف" }, { status: 400 });
  }
  const limited = await enrollmentWriteGuard(ctx.mosqueId);
  if (limited) return limited;

  try {
    const result = await moveWaitlistEntry(ctx.mosqueId, registrationId, body.direction);
    if (result === "not_found") return Response.json({ error: "غير موجود بقائمة الانتظار" }, { status: 404 });
    return Response.json({ ok: true, moved: result === "moved" });
  } catch (error) {
    await logServerError("waitlist:move", error);
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; registrationId: string }> }) {
  const { id, registrationId: rawRegistrationId } = await params;
  const ctx = await enrollmentGate(id);
  if (ctx instanceof Response) return ctx;
  const registrationId = parsePositiveIntParam(rawRegistrationId);
  if (registrationId === null) return paramNotFound();

  const limited = await enrollmentWriteGuard(ctx.mosqueId);
  if (limited) return limited;

  try {
    if (!(await removeWaitlistEntry(ctx.mosqueId, registrationId))) {
      return Response.json({ error: "غير موجود بقائمة الانتظار" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("waitlist:remove", error);
    throw error;
  }
}
