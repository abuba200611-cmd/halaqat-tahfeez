import { featureGate, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import {
  createBadge,
  findBadgeTargetName,
  isFeatureEnabled,
  listBadges,
  listEvaluationTargets,
  listRecentAwards,
  listTargetAwards,
} from "@/lib/mosque/db";

const FEATURE = "badges";

function isBadgeTargetKind(value: unknown): value is "student" | "family" | "member" {
  return value === "student" || value === "family" || value === "member";
}

/**
 * أوسمة الجامع مع آخر المنح. معاملان اختياريان kind/targetId (معاً) يعيدان
 * معها أوسمة ذلك الهدف تحديداً. الأسر تُعاد لمنتقي الأهداف إن كانت ميزتها مفعّلة.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const url = new URL(request.url);
  const kindParam = url.searchParams.get("kind");
  const targetParam = parsePositiveIntParam(url.searchParams.get("targetId") ?? undefined);
  let kind: "student" | "family" | "member" | null = null;
  let targetId: number | null = null;
  if (kindParam !== null || targetParam !== null) {
    if (!isBadgeTargetKind(kindParam) || targetParam === null) {
      return Response.json({ error: "kind يجب أن يكون student أو family أو member، وtargetId رقماً موجباً" }, { status: 400 });
    }
    kind = kindParam;
    targetId = targetParam;
  }

  const targetName = kind && targetId !== null ? await findBadgeTargetName(mosqueId, kind, targetId) : null;
  if (kind && targetId !== null && targetName === null) {
    return Response.json({ error: "الهدف ليس من هذا الجامع" }, { status: 404 });
  }

  const familiesOn = await isFeatureEnabled(mosqueId, "families");
  const [badges, recentAwards, families, targetAwards] = await Promise.all([
    listBadges(mosqueId),
    listRecentAwards(mosqueId),
    familiesOn ? listEvaluationTargets(mosqueId, "family") : Promise.resolve([]),
    kind && targetId !== null ? listTargetAwards(mosqueId, kind, targetId) : Promise.resolve([]),
  ]);

  return Response.json({
    badges,
    recentAwards,
    families,
    ...(kind && targetId !== null ? { target: { kind, id: targetId, name: targetName }, targetAwards } : {}),
  });
}

/** وسام جديد — الاسم واجب، والأيقونة إيموجي قصير */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    icon?: unknown;
    description?: unknown;
    criteriaNote?: unknown;
  };
  const name = text(body.name, 100);
  if (!name) return Response.json({ error: "اسم الوسام مطلوب" }, { status: 400 });

  const badge = await createBadge(mosqueId, {
    name,
    icon: text(body.icon, 16) || "🏅",
    description: text(body.description, 500),
    criteriaNote: text(body.criteriaNote, 300),
  });
  if (!badge) return Response.json({ error: "يوجد وسام بهذا الاسم أصلاً" }, { status: 409 });
  return Response.json({ badge }, { status: 201 });
}
