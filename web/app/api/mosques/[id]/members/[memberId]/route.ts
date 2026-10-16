import { featureGateAny, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { deleteMosqueMember } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; memberId: string }> };

/** حذف عضو حر (ولي أمر/متطوع) — الطلاب لا يُحذفون من هنا. ارتباطاته بالأسر واللجان تختفي من العرض تلقائياً */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, memberId } = await params;
  const mosqueId = Number(id);
  if ([id, memberId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGateAny(mosqueId, ["families", "committees"]);
  if (gate) return gate;

  const deleted = await deleteMosqueMember(mosqueId, Number(memberId));
  if (!deleted) return Response.json({ error: "العضو غير موجود" }, { status: 404 });
  return Response.json({ ok: true });
}
