import { currentTeacher, unauthorized } from "@/lib/auth";
import { acknowledgeHalaqahEvent, disciplineContextForHalaqah } from "@/lib/discipline-db";
import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";

/*
  A2 — إقرار استلام حدث انضباط (توقيع ولي الأمر على الإنذار/التعهد مثلاً).
  محصور بأحداث حلقة المعلّم من الجلسة — حدث حلقة أخرى يرجع 404.
*/

type RouteContext = { params: Promise<{ eventId: string }> };

export async function PATCH(_request: Request, { params }: RouteContext) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const eventId = parsePositiveIntParam((await params).eventId);
  if (eventId === null) return paramNotFound();

  const ctx = await disciplineContextForHalaqah(teacher.halaqahId);
  if (!ctx) return Response.json({ error: "الانضباط والمتابعة غير مفعّل لهذا الجامع" }, { status: 404 });

  const ok = await acknowledgeHalaqahEvent(teacher.halaqahId, eventId);
  if (!ok) return Response.json({ error: "غير موجود" }, { status: 404 });
  return Response.json({ ok: true });
}
