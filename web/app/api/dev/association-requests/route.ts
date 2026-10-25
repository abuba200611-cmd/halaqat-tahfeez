import { devConsoleGate } from "@/lib/dev-gate";
import {
  countPendingAssociationRequests,
  listAssociationRegistrationRequests,
} from "@/lib/association-registration-db";
import { logServerError } from "@/lib/dev-error-log";

/**
 * طلبات تسجيل الجمعيات للوحة المطوّر: ?count=1 يرجع عدّاد المعلّق فقط
 * (شارة القائمة)، وبدونه القائمة الكاملة.
 */
export async function GET(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  try {
    if (new URL(request.url).searchParams.get("count") === "1") {
      return Response.json({ pending: await countPendingAssociationRequests() });
    }
    const requests = await listAssociationRegistrationRequests();
    return Response.json({ requests, pending: requests.filter((r) => r.status === "pending").length });
  } catch (error) {
    await logServerError("dev:association-requests", error);
    return Response.json({ error: "تعذّر تحميل الطلبات" }, { status: 500 });
  }
}
