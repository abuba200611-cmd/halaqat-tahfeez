import { featureGate, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import {
  deleteSession,
  getSession,
  setSessionCommittee,
  setSessionRoster,
  updateSession,
  validateCommittee,
  validateRoster,
} from "@/lib/mosque/exams-db";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * تعديل جلسة — التاريخ والمقر والملاحظات والحالة، و/أو اللجنة (تُستبدل
 * كاملة)، و/أو كشف الترشيحات nominationIds (يُستبدل كاملاً: الجديد يُجدوَل
 * ومن خرج بلا نتيجة يعود بانتظار الجدولة).
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id, sessionId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const sessionIdNum = parsePositiveIntParam(sessionId);
  if (mosqueId === null || sessionIdNum === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const session = await getSession(mosqueId, sessionIdNum);
  if (!session) return Response.json({ error: "الجلسة غير موجودة" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const changes: Parameters<typeof updateSession>[2] = {};
  if (body.sessionDate !== undefined) {
    const sessionDate = text(body.sessionDate, 10);
    if (!ISO_DATE.test(sessionDate)) return Response.json({ error: "تاريخ الجلسة غير صحيح" }, { status: 400 });
    changes.sessionDate = sessionDate;
  }
  if (body.location !== undefined) changes.location = text(body.location, 200);
  if (body.notes !== undefined) changes.notes = text(body.notes, 500);
  if (body.status !== undefined) {
    if (body.status !== "scheduled" && body.status !== "closed") {
      return Response.json({ error: "حالة الجلسة غير صحيحة" }, { status: 400 });
    }
    changes.status = body.status;
  }
  if (Object.keys(changes).length > 0) await updateSession(mosqueId, sessionIdNum, changes);

  if (body.committee !== undefined) {
    const committee = await validateCommittee(mosqueId, Array.isArray(body.committee) ? body.committee : []);
    if (typeof committee === "string") return Response.json({ error: committee }, { status: 400 });
    await setSessionCommittee(mosqueId, sessionIdNum, committee);
  }

  if (body.nominationIds !== undefined) {
    const roster = await validateRoster(mosqueId, session.typeId, Array.isArray(body.nominationIds) ? body.nominationIds : []);
    if (typeof roster === "string") return Response.json({ error: roster }, { status: 400 });
    await setSessionRoster(mosqueId, sessionIdNum, roster);
  }

  return Response.json({ session: await getSession(mosqueId, sessionIdNum) });
}

/** حذف جلسة بلا نتائج — ما له نتائج يُرفض حماية للسجل الدراسي */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, sessionId } = await params;
  const mosqueId = parsePositiveIntParam(id);
  const sessionIdNum = parsePositiveIntParam(sessionId);
  if (mosqueId === null || sessionIdNum === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const deleted = await deleteSession(mosqueId, sessionIdNum);
  if (deleted === "has-results") {
    return Response.json({ error: "لا يمكن حذف جلسة لها نتائج مسجَّلة — أغلقها بدلاً من ذلك" }, { status: 409 });
  }
  if (!deleted) return Response.json({ error: "الجلسة غير موجودة" }, { status: 404 });
  return Response.json({ ok: true });
}
