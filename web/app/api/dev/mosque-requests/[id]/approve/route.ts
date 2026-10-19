import { devConsoleGate } from "@/lib/dev-gate";
import { approveRegistrationRequest } from "@/lib/mosque-registration-db";
import { logServerError } from "@/lib/dev-error-log";

const MESSAGES = {
  not_found: ["الطلب غير موجود", 404],
  already_decided: ["تم البتّ في هذا الطلب من قبل", 409],
  username_taken: ["اسم المستخدم صار محجوزاً لمدير جامع آخر", 409],
  association_not_found: ["الجمعية المختارة غير موجودة", 400],
} as const;

/**
 * الموافقة: ينشئ الجامع ومديره بترانزاكشن واحدة (الأدوات في
 * lib/mosque-registration-db.ts). مكررة الاستدعاء = 409 بلا إنشاء ثانٍ.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "معرّف غير صالح" }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as { associationId?: unknown };
  let associationId: number | null | undefined;
  if (body.associationId !== undefined && body.associationId !== null) {
    if (typeof body.associationId !== "number" || !Number.isSafeInteger(body.associationId) || body.associationId <= 0) {
      return Response.json({ error: "معرّف الجمعية غير صالح" }, { status: 400 });
    }
    associationId = body.associationId;
  }

  try {
    const result = await approveRegistrationRequest(id, { associationId });
    if (!result.ok) {
      const [error, status] = MESSAGES[result.code];
      return Response.json({ error, code: result.code }, { status });
    }
    return Response.json({ ok: true, mosqueId: result.mosqueId, associationId: result.associationId });
  } catch (error) {
    await logServerError("dev:mosque-requests:approve", error);
    return Response.json({ error: "تعذّرت الموافقة" }, { status: 500 });
  }
}
