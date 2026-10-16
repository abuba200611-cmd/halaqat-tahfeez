import { featureGate, isTargetKind, parseIntIn, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { isSaturday, parseWeekStart } from "@/lib/mosque/evaluation";
import { listCriteria, listEvaluationTargets, listWeekEvaluations, upsertEvaluations } from "@/lib/mosque/db";

const FEATURE = "weekly_evaluation";
const MAX_ENTRIES = 2000;
const WEEK_ERROR = "الأسبوع يجب أن يبدأ يوم السبت بصيغة YYYY-MM-DD";
const KIND_ERROR = "نوع الهدف يجب أن يكون family أو student";

/**
  شبكة أسبوع: المعايير الفعّالة + الأهداف (أسر أو طلاب) + الدرجات المحفوظة.
  المعاملات: week=YYYY-MM-DD (يجب أن يكون سبتاً) و kind=family|student.
*/
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const url = new URL(request.url);
  const week = url.searchParams.get("week") ?? "";
  const kind = url.searchParams.get("kind");
  const weekDate = parseWeekStart(week);
  if (!weekDate || !isSaturday(weekDate)) return Response.json({ error: WEEK_ERROR }, { status: 400 });
  if (!isTargetKind(kind)) return Response.json({ error: KIND_ERROR }, { status: 400 });

  const [criteria, targets, entries] = await Promise.all([
    listCriteria(mosqueId),
    listEvaluationTargets(mosqueId, kind),
    listWeekEvaluations(mosqueId, week, kind),
  ]);
  return Response.json({ week, kind, criteria: criteria.filter((c) => c.active), targets, entries });
}

/**
  حفظ درجات الأسبوع (upsert: الخلية الواحدة أسبوع+هدف+معيار تُستبدل).
  أي خلية غير صالحة ترفض الطلب كله — لا حفظ جزئي: الهدف من هذا الجامع،
  المعيار من معاييره، والدرجة عدد صحيح 0..الدرجة العظمى لذلك المعيار.
*/
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    week?: unknown;
    kind?: unknown;
    entries?: unknown;
  };
  const week = typeof body.week === "string" ? body.week : "";
  const weekDate = parseWeekStart(week);
  if (!weekDate || !isSaturday(weekDate)) return Response.json({ error: WEEK_ERROR }, { status: 400 });
  if (!isTargetKind(body.kind)) return Response.json({ error: KIND_ERROR }, { status: 400 });
  if (!Array.isArray(body.entries) || body.entries.length === 0 || body.entries.length > MAX_ENTRIES) {
    return Response.json({ error: `الدرجات مطلوبة (حتى ${MAX_ENTRIES} خلية)` }, { status: 400 });
  }

  const [criteria, targets] = await Promise.all([
    listCriteria(mosqueId),
    listEvaluationTargets(mosqueId, body.kind),
  ]);
  const maxByCriterion = new Map(criteria.map((c) => [c.id, c.maxScore]));
  const validTargets = new Set(targets.map((t) => t.id));

  // آخر قيمة لنفس الخلية داخل الطلب تغلب (لا نرسل صفين متعارضين للقاعدة)
  const cells = new Map<string, { targetId: number; criterionId: number; score: number; note: string }>();
  for (const raw of body.entries as Record<string, unknown>[]) {
    const targetId = Number(raw?.targetId);
    const criterionId = Number(raw?.criterionId);
    const max = maxByCriterion.get(criterionId);
    if (!validTargets.has(targetId) || max === undefined) {
      return Response.json({ error: "هدف أو معيار ليس من هذا الجامع" }, { status: 400 });
    }
    const score = parseIntIn(raw.score, 0, max);
    if (Number.isNaN(score)) {
      return Response.json({ error: `الدرجة يجب أن تكون عدداً صحيحاً بين 0 و${max}` }, { status: 400 });
    }
    cells.set(`${targetId}:${criterionId}`, { targetId, criterionId, score, note: text(raw.note, 200) });
  }

  await upsertEvaluations(mosqueId, week, body.kind, [...cells.values()]);
  return Response.json({ ok: true, saved: cells.size });
}
