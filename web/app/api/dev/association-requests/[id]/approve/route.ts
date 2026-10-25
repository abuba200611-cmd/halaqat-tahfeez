import { devConsoleGate } from "@/lib/dev-gate";
import { approveAssociationRegistrationRequest } from "@/lib/association-registration-db";
import { logServerError } from "@/lib/dev-error-log";

const MESSAGES = {
  not_found: ["الطلب غير موجود", 404],
  already_decided: ["تم البتّ في هذا الطلب من قبل", 409],
  username_taken: ["اسم المستخدم صار محجوزاً لمدير جمعية آخر", 409],
} as const;

/**
 * الموافقة: تنشئ الجمعية ومديرها بترانزاكشن واحدة (lib/association-registration-db.ts)
 * وتكتب سجل التدقيق. مكررة الاستدعاء = 409 بلا إنشاء ثانٍ.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "معرّف غير صالح" }, { status: 400 });

  try {
    const result = await approveAssociationRegistrationRequest(id);
    if (!result.ok) {
      const [error, status] = MESSAGES[result.code];
      return Response.json({ error, code: result.code }, { status });
    }
    return Response.json({ ok: true, associationId: result.associationId, adminId: result.adminId });
  } catch (error) {
    await logServerError("dev:association-requests:approve", error);
    return Response.json({ error: "تعذّرت الموافقة" }, { status: 500 });
  }
}
