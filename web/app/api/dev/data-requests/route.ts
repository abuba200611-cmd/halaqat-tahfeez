import { devConsoleGate } from "@/lib/dev-gate";
import { countPendingDeletionRequests, listDeletionRequests } from "@/lib/data-requests";
import { logServerError } from "@/lib/dev-error-log";

/** طلبات حذف البيانات للوحة المطوّر: ?count=1 يرجع عدّاد المعلّق فقط (الشارة) */
export async function GET(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  try {
    if (new URL(request.url).searchParams.get("count") === "1") {
      return Response.json({ pending: await countPendingDeletionRequests() });
    }
    const requests = await listDeletionRequests();
    return Response.json({ requests, pending: requests.filter((r) => r.status === "pending").length });
  } catch (error) {
    await logServerError("dev:data-requests", error);
    return Response.json({ error: "تعذّر تحميل الطلبات" }, { status: 500 });
  }
}
