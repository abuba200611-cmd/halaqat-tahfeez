import { enrollmentGate, enrollmentWriteGuard } from "@/lib/enrollment-api";
import { autoAssignPending, getEnrollmentOverview, markActivityRead } from "@/lib/mosque/enrollment-db";
import { logServerError } from "@/lib/dev-error-log";

/** لوحة التوزيع الآلي: حلقات بسعتها ومعاييرها وإشغالها، قائمة الانتظار، وسجل النشاط */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await enrollmentGate((await params).id);
  if (ctx instanceof Response) return ctx;
  return Response.json(await getEnrollmentOverview(ctx.mosqueId));
}

/** { action: "run" } يوزّع المعلّقين القدامى آلياً · { action: "mark_read" } يقرأ كل الإشعارات */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await enrollmentGate((await params).id);
  if (ctx instanceof Response) return ctx;

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "run" && body.action !== "mark_read") {
    return Response.json({ error: "إجراء غير معروف" }, { status: 400 });
  }
  const limited = await enrollmentWriteGuard(ctx.mosqueId);
  if (limited) return limited;

  try {
    if (body.action === "mark_read") {
      await markActivityRead(ctx.mosqueId);
      return Response.json({ ok: true });
    }
    return Response.json({ ok: true, ...(await autoAssignPending(ctx.mosqueId)) });
  } catch (error) {
    await logServerError("enrollment:post", error);
    throw error;
  }
}
