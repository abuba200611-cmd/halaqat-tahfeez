import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque } from "@/lib/mosque/db";
import { validateReviewTrackSettings } from "@/lib/review-track-config";
import { getReviewTrackConfig, updateReviewTrackConfig } from "@/lib/mosque/review-tracks-db";

/*
  إعدادات تصنيف المراجعة (الكبرى/الصغرى) لجامع: عدد الصفحات المجاورة
  للحفظ الجديد والتسمية. بلا featureGate عمداً — التفعيل يُدار بعمود
  enabled عبر مسار المزايا العام، والبطاقة تُقرأ وتُحفظ الضبط ولو كانت
  الميزة معطّلة حتى يستطيع المدير إعادة تفعيلها.
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  return Response.json({ config: await getReviewTrackConfig(mosqueId) });
}

/** تحديث الضبط (قيم كاملة مُتحقَّقة) — التصحيح عند القراءة أيضاً */
export async function PATCH(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { config?: unknown };
  const parsed = validateReviewTrackSettings(body.config);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  await updateReviewTrackConfig(mosqueId, parsed.value);
  return Response.json({ config: await getReviewTrackConfig(mosqueId) });
}
