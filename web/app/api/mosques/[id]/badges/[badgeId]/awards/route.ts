import { featureGate, parseIntIn, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { formatWeek, parseWeekStart } from "@/lib/mosque/evaluation";
import { awardBadge, findBadgeTargetName, getBadge } from "@/lib/mosque/db";

const KIND_ERROR = "نوع الهدف يجب أن يكون student أو family أو member";
const DATE_ERROR = "تاريخ المنح يجب أن يكون تاريخاً صالحاً بصيغة YYYY-MM-DD";

/**
 * منح الوسام لهدف من هذا الجامع. مرة واحدة (وسام، هدف) في اليوم —
 * التكرار بنفس اليوم 409، والهدف من جامع آخر 400.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; badgeId: string }> }) {
  const { id, badgeId } = await params;
  const mosqueId = Number(id);
  if ([id, badgeId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "badges");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    targetKind?: unknown;
    targetId?: unknown;
    awardedAt?: unknown;
    note?: unknown;
  };
  const kind = body.targetKind;
  if (kind !== "student" && kind !== "family" && kind !== "member") {
    return Response.json({ error: KIND_ERROR }, { status: 400 });
  }
  const targetId = parseIntIn(body.targetId, 1, Number.MAX_SAFE_INTEGER);
  if (Number.isNaN(targetId)) return Response.json({ error: "targetId يجب أن يكون رقماً موجباً" }, { status: 400 });

  // تاريخ المنح اختياري (الافتراضي اليوم)، لكنه إن أُرسل فلا نقبل إلا تاريخاً حقيقياً
  let awardedAt = formatWeek(new Date());
  if (body.awardedAt !== undefined && body.awardedAt !== null && body.awardedAt !== "") {
    if (typeof body.awardedAt !== "string" || !parseWeekStart(body.awardedAt)) {
      return Response.json({ error: DATE_ERROR }, { status: 400 });
    }
    awardedAt = body.awardedAt;
  }

  const badge = await getBadge(mosqueId, Number(badgeId));
  if (!badge) return Response.json({ error: "الوسام غير موجود" }, { status: 404 });

  if ((await findBadgeTargetName(mosqueId, kind, targetId)) === null) {
    return Response.json({ error: "الهدف ليس من هذا الجامع" }, { status: 400 });
  }

  const award = await awardBadge(mosqueId, badge.id, kind, targetId, awardedAt, text(body.note, 200));
  if (award === null) return Response.json({ error: "الوسام غير موجود" }, { status: 404 });
  if (award === "duplicate") {
    return Response.json({ error: "مُنح هذا الوسام لنفس الهدف اليوم أصلاً" }, { status: 409 });
  }
  return Response.json({ award }, { status: 201 });
}
