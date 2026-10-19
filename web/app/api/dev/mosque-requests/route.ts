import { devConsoleGate } from "@/lib/dev-gate";
import { countPendingRegistrationRequests, listRegistrationRequests } from "@/lib/mosque-registration-db";
import { listAssociations } from "@/lib/association-db";
import { logServerError } from "@/lib/dev-error-log";

/**
 * طلبات تسجيل الجوامع للوحة المطوّر: ?count=1 يرجع عدّاد المعلّق فقط (شارة
 * القائمة)، وبدونه القائمة الكاملة + الجمعيات لاختيار الربط عند الموافقة.
 */
export async function GET(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  try {
    if (new URL(request.url).searchParams.get("count") === "1") {
      return Response.json({ pending: await countPendingRegistrationRequests() });
    }
    const [requests, associations] = await Promise.all([listRegistrationRequests(), listAssociations()]);
    return Response.json({
      requests,
      pending: requests.filter((r) => r.status === "pending").length,
      associations: associations.map((a) => ({ id: a.id, name: a.name })),
    });
  } catch (error) {
    await logServerError("dev:mosque-requests", error);
    return Response.json({ error: "تعذّر تحميل الطلبات" }, { status: 500 });
  }
}
