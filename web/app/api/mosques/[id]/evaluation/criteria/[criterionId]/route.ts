import { featureGate, parseIntIn, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { deleteCriterion, updateCriterion } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; criterionId: string }> };

/** تعديل معيار: الاسم و/أو الدرجة العظمى و/أو التفعيل */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id, criterionId } = await params;
  const mosqueId = Number(id);
  if ([id, criterionId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "weekly_evaluation");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    maxScore?: unknown;
    active?: unknown;
  };
  const changes: { name?: string; maxScore?: number; active?: boolean } = {};
  if (body.name !== undefined) {
    changes.name = text(body.name, 100);
    if (!changes.name) return Response.json({ error: "اسم المعيار لا يمكن أن يكون فارغاً" }, { status: 400 });
  }
  if (body.maxScore !== undefined) {
    const maxScore = parseIntIn(body.maxScore, 1, 100);
    if (Number.isNaN(maxScore)) {
      return Response.json({ error: "الدرجة العظمى يجب أن تكون عدداً صحيحاً بين 1 و100" }, { status: 400 });
    }
    changes.maxScore = maxScore;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      return Response.json({ error: "التفعيل يجب أن يكون true أو false" }, { status: 400 });
    }
    changes.active = body.active;
  }

  const criterion = await updateCriterion(mosqueId, Number(criterionId), changes);
  if (criterion === "conflict") return Response.json({ error: "يوجد معيار بهذا الاسم" }, { status: 409 });
  if (!criterion) return Response.json({ error: "المعيار غير موجود" }, { status: 404 });
  return Response.json({ criterion });
}

/** حذف معيار يحذف درجاته (تسلسل بالقاعدة) — الأفضل تعطيله للحفاظ على السجل */
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id, criterionId } = await params;
  const mosqueId = Number(id);
  if ([id, criterionId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "weekly_evaluation");
  if (gate) return gate;

  const deleted = await deleteCriterion(mosqueId, Number(criterionId));
  if (!deleted) return Response.json({ error: "المعيار غير موجود" }, { status: 404 });
  return Response.json({ ok: true });
}
