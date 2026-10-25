import { devConsoleGate } from "@/lib/dev-gate";
import { parseRejectReason } from "@/lib/mosque-registration";
import { rejectAssociationRegistrationRequest } from "@/lib/association-registration-db";
import { logServerError } from "@/lib/dev-error-log";

/** الرفض بسبب إلزامي يظهر لمقدّم الطلب عند محاولته الدخول */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "معرّف غير صالح" }, { status: 400 });

  const parsed = parseRejectReason(await request.json().catch(() => ({})));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    const result = await rejectAssociationRegistrationRequest(id, parsed.reason);
    if (!result.ok) {
      return result.code === "not_found"
        ? Response.json({ error: "الطلب غير موجود" }, { status: 404 })
        : Response.json({ error: "تم البتّ في هذا الطلب من قبل", code: result.code }, { status: 409 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("dev:association-requests:reject", error);
    return Response.json({ error: "تعذّر الرفض" }, { status: 500 });
  }
}
