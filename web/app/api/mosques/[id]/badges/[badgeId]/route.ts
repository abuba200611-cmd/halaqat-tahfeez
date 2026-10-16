import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { deleteBadge, getBadge, listBadgeAwards } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; badgeId: string }> };

/** وسام واحد مع كل منحه */
export async function GET(_request: Request, { params }: RouteContext) {
  const { id, badgeId } = await params;
  const mosqueId = Number(id);
  if ([id, badgeId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "badges");
  if (gate) return gate;

  const badge = await getBadge(mosqueId, Number(badgeId));
  if (!badge) return Response.json({ error: "الوسام غير موجود" }, { status: 404 });

  return Response.json({ badge, awards: await listBadgeAwards(mosqueId, badge.id) });
}

/** حذف الوسام يحذف منحه معه (تسلسل بالقاعدة) */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, badgeId } = await params;
  const mosqueId = Number(id);
  if ([id, badgeId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "badges");
  if (gate) return gate;

  const deleted = await deleteBadge(mosqueId, Number(badgeId));
  if (!deleted) return Response.json({ error: "الوسام غير موجود" }, { status: 404 });
  return Response.json({ ok: true });
}
