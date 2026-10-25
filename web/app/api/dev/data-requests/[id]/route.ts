import { devConsoleGate } from "@/lib/dev-gate";
import { DELETION_NOTE_MAX, decideDeletionRequest } from "@/lib/data-requests";
import { logServerError } from "@/lib/dev-error-log";

/**
 * البتّ في طلب حذف: decision = "done" (نُفِّذ الحذف) أو "rejected" (مع سبب
 * إلزامي). الحذف نفسه يُنفَّذ يدوياً قبل «done» — هذا المسار يوثّق القرار فقط.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { decision?: unknown; note?: unknown };
  const decision = body.decision;
  if (decision !== "done" && decision !== "rejected") {
    return Response.json({ error: "القرار غير صالح" }, { status: 400 });
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, DELETION_NOTE_MAX) : "";
  if (decision === "rejected" && note.length < 3) {
    return Response.json({ error: "سبب الرفض مطلوب" }, { status: 400 });
  }

  try {
    const result = await decideDeletionRequest(id, decision, note);
    if (!result.ok) {
      return result.code === "not_found"
        ? Response.json({ error: "الطلب غير موجود" }, { status: 404 })
        : Response.json({ error: "تم البتّ في هذا الطلب من قبل", code: result.code }, { status: 409 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("dev:data-requests:decide", error);
    return Response.json({ error: "تعذّر حفظ القرار" }, { status: 500 });
  }
}
