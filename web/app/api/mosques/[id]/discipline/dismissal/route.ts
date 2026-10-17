import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { dismissStudent } from "@/lib/discipline-db";
import { DISCIPLINE_COMMITTEE_NOTE_MAX, DISCIPLINE_COMMITTEE_NOTE_MIN } from "@/lib/discipline";
import { logServerError } from "@/lib/dev-error-log";

/*
  A2 — الفصل النهائي: من إدارة الجامع فقط (لا مسار معلّم له)، بملاحظة
  لجنة إلزامية. الطالب يصير غير فعّال بلا استرجاع تلقائي، ويُسجَّل الحدث
  بأسبابه. محصور بحلقات هذا الجامع.
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "discipline");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const halaqahId = parsePositiveIntParam(String(body.halaqahId ?? ""));
  if (halaqahId === null) return Response.json({ error: "حلقة غير صالحة" }, { status: 400 });
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId) return Response.json({ error: "الطالب مفقود" }, { status: 400 });

  const committeeNote =
    typeof body.committeeNote === "string" ? body.committeeNote.trim().slice(0, DISCIPLINE_COMMITTEE_NOTE_MAX) : "";
  if (committeeNote.length < DISCIPLINE_COMMITTEE_NOTE_MIN) {
    return Response.json({ error: "ملاحظة اللجنة إلزامية (١٠ أحرف على الأقل)" }, { status: 400 });
  }

  try {
    const result = await dismissStudent({ mosqueId, halaqahId, studentId, committeeNote });
    if (!result.found) return Response.json({ error: "غير موجود" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("mosque-discipline-dismissal:post", error);
    throw error;
  }
}
