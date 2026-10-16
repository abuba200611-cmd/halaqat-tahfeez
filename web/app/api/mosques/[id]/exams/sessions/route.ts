import { featureGate, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import {
  createSession,
  getSession,
  setSessionCommittee,
  validateCommittee,
} from "@/lib/mosque/exams-db";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** جلسة جديدة — النوع من جامعنا، والتاريخ YYYY-MM-DD، واللجنة اختيارية هنا */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const typeId = parsePositiveIntParam(typeof body.typeId === "string" ? body.typeId : String(body.typeId ?? ""));
  if (typeId === null) return Response.json({ error: "نوع الاختبار مطلوب" }, { status: 400 });
  const sessionDate = text(body.sessionDate, 10);
  if (!ISO_DATE.test(sessionDate)) return Response.json({ error: "تاريخ الجلسة غير صحيح" }, { status: 400 });

  const committee = await validateCommittee(mosqueId, Array.isArray(body.committee) ? body.committee : []);
  if (typeof committee === "string") return Response.json({ error: committee }, { status: 400 });

  const sessionId = await createSession(mosqueId, {
    typeId,
    sessionDate,
    location: text(body.location, 200),
    notes: text(body.notes, 500),
  });
  if (sessionId === null) return Response.json({ error: "نوع الاختبار غير موجود" }, { status: 404 });

  if (committee.length > 0) await setSessionCommittee(mosqueId, sessionId, committee);
  return Response.json({ session: await getSession(mosqueId, sessionId) }, { status: 201 });
}
