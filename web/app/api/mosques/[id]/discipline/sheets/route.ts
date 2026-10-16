import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { adminSetSheet, listMosqueSheets } from "@/lib/discipline-db";
import { isValidMonthKey } from "@/lib/hijri";
import { logServerError } from "@/lib/dev-error-log";

/*
  A2 — كشوف المتابعة الشهرية لإدارة الجامع: كل حلقات الجامع لشهر بحالتها
  (مسوّدة/مُسلَّمة/مراجَعة)، مع مراجعة أي كشف أو فتحه لتعديل المعلّم.
*/

type RouteContext = { params: Promise<{ id: string }> };

/** كشوف كل الحلقات: ?month=YYYY-MM (هجري) */
export async function GET(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "discipline");
  if (gate) return gate;

  const month = new URL(request.url).searchParams.get("month") ?? "";
  if (!isValidMonthKey(month)) return Response.json({ error: "شهر غير صحيح" }, { status: 400 });

  try {
    const sheets = await listMosqueSheets(mosqueId, month);
    return Response.json({ month, sheets });
  } catch (error) {
    await logServerError("mosque-discipline-sheets:get", error);
    throw error;
  }
}

/** مراجعة كشف أو فتحه: { halaqahId, month, action: review|reopen } */
export async function PATCH(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "discipline");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const halaqahId = parsePositiveIntParam(String(body.halaqahId ?? ""));
  if (halaqahId === null) return Response.json({ error: "حلقة غير صالحة" }, { status: 400 });
  const month = typeof body.month === "string" ? body.month : "";
  if (!isValidMonthKey(month)) return Response.json({ error: "شهر غير صحيح" }, { status: 400 });
  if (body.action !== "review" && body.action !== "reopen") {
    return Response.json({ error: "إجراء غير معروف" }, { status: 400 });
  }

  try {
    const ok = await adminSetSheet(mosqueId, halaqahId, month, body.action);
    if (!ok) return Response.json({ error: "غير موجود" }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("mosque-discipline-sheets:patch", error);
    throw error;
  }
}
