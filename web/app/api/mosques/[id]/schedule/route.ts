import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { parseSlotBody } from "@/lib/mosque/schedule";
import {
  checkScheduleRef,
  createScheduleSlot,
  isFeatureEnabled,
  listCommittees,
  listEvaluationTargets,
  listHalaqahs,
  listScheduleSlots,
} from "@/lib/mosque/db";

const FEATURE = "weekly_schedule";

/**
 * جدول الأسبوع + قوائم الربط المتاحة (حلقات/أسر/لجان — كلٌّ عند تفعيل
 * ميزته) ليختار المستخدم منها عند إنشاء الخانات.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const [slots, halaqatOn, familiesOn, committeesOn] = await Promise.all([
    listScheduleSlots(mosqueId),
    isFeatureEnabled(mosqueId, "halaqat"),
    isFeatureEnabled(mosqueId, "families"),
    isFeatureEnabled(mosqueId, "committees"),
  ]);
  const [halaqahs, families, committees] = await Promise.all([
    halaqatOn
      ? listHalaqahs(mosqueId).then((rows) => rows.map((h) => ({ id: h.id, name: h.halaqahName })))
      : Promise.resolve([]),
    familiesOn ? listEvaluationTargets(mosqueId, "family") : Promise.resolve([]),
    committeesOn ? listCommittees(mosqueId).then((rows) => rows.map((c) => ({ id: c.id, name: c.name }))) : Promise.resolve([]),
  ]);

  return Response.json({ slots, refs: { halaqahs, families, committees } });
}

/** خانة جديدة — مدقق lib/schedule ثم فحص انتماء ref_id للجامع نفسه */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const { slot, error } = parseSlotBody(await request.json().catch(() => ({})));
  if (!slot) return Response.json({ error }, { status: 400 });

  const refError = await checkScheduleRef(mosqueId, slot);
  if (refError) return Response.json({ error: refError }, { status: 400 });

  const created = await createScheduleSlot(mosqueId, slot);
  return Response.json({ slot: created }, { status: 201 });
}
