import { featureGate, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { isTagKind, type TagKind } from "@/lib/mosque/archive";
import {
  createActivity,
  isFeatureEnabled,
  listActivities,
  listCommittees,
  listFamilies,
  listHalaqahs,
  tagBelongsToMosque,
} from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string }> };

/** تاريخ YYYY-MM-DD حقيقي (لا 2026-02-31)، أو null */
function parseDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value;
}

/** أنشطة الجامع + خيارات الوسم (حلقات/أسر/لجان مفعّلة فقط) */
export async function GET(_request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "archive");
  if (gate) return gate;

  const [activities, halaqat, families, committees] = await Promise.all([
    listActivities(mosqueId),
    isFeatureEnabled(mosqueId, "halaqat").then((on) => (on ? listHalaqahs(mosqueId) : [])),
    isFeatureEnabled(mosqueId, "families").then((on) => (on ? listFamilies(mosqueId) : [])),
    isFeatureEnabled(mosqueId, "committees").then((on) => (on ? listCommittees(mosqueId) : [])),
  ]);
  return Response.json({
    activities,
    tagOptions: {
      halaqah: halaqat.map((h) => ({ id: h.id, name: h.halaqahName })),
      family: families.map((f) => ({ id: f.id, name: f.name })),
      committee: committees.map((c) => ({ id: c.id, name: c.name })),
    },
  });
}

/** نشاط جديد — العنوان والتاريخ واجبان، والوسم اختياري ويجب أن يكون من الجامع نفسه */
export async function POST(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "archive");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    title?: unknown;
    description?: unknown;
    activityDate?: unknown;
    tagKind?: unknown;
    tagId?: unknown;
  };
  const title = text(body.title, 150);
  if (!title) return Response.json({ error: "عنوان النشاط مطلوب" }, { status: 400 });
  const activityDate = parseDate(body.activityDate);
  if (!activityDate) return Response.json({ error: "تاريخ النشاط غير صالح" }, { status: 400 });

  let tagKind: TagKind | null = null;
  let tagId: number | null = null;
  if (body.tagKind !== undefined && body.tagKind !== null && body.tagKind !== "") {
    if (!isTagKind(body.tagKind)) return Response.json({ error: "نوع الوسم غير صالح" }, { status: 400 });
    tagId = parsePositiveIntParam(String(body.tagId ?? ""));
    if (tagId === null) return Response.json({ error: "الوسم غير صالح" }, { status: 400 });
    if (!(await tagBelongsToMosque(mosqueId, body.tagKind, tagId))) {
      return Response.json({ error: "الوسم ليس من هذا الجامع" }, { status: 400 });
    }
    tagKind = body.tagKind;
  }

  const id = await createActivity(mosqueId, {
    title,
    description: text(body.description, 2000),
    activityDate,
    tagKind,
    tagId,
  });
  return Response.json({ id }, { status: 201 });
}
