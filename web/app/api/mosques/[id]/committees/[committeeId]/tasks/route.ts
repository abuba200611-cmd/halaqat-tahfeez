import { featureGate, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { createCommitteeTask } from "@/lib/mosque/db";
import { parseWeekStart } from "@/lib/mosque/evaluation";

type RouteContext = { params: Promise<{ id: string; committeeId: string }> };

/** مهمة جديدة بحالة todo — العنوان واجب، وتاريخ الاستحقاق اختياري (YYYY-MM-DD) */
export async function POST(request: Request, { params }: RouteContext) {
  const { id, committeeId } = await params;
  const mosqueId = Number(id);
  if ([id, committeeId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { title?: unknown; dueDate?: unknown };
  const title = text(body.title, 200);
  if (!title) return Response.json({ error: "عنوان المهمة مطلوب" }, { status: 400 });

  let dueDate: string | null = null;
  if (body.dueDate !== undefined && body.dueDate !== null && body.dueDate !== "") {
    if (typeof body.dueDate !== "string" || !parseWeekStart(body.dueDate)) {
      return Response.json({ error: "تاريخ الاستحقاق غير صالح" }, { status: 400 });
    }
    dueDate = body.dueDate;
  }

  const task = await createCommitteeTask(mosqueId, Number(committeeId), { title, dueDate });
  if (!task) return Response.json({ error: "اللجنة غير موجودة" }, { status: 404 });
  return Response.json({ task }, { status: 201 });
}
