import { featureGate, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { createFamily, listFamilies } from "@/lib/mosque/db";

/** أسر الجامع مع عدد أفراد كل أسرة */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "families");
  if (gate) return gate;

  return Response.json({ families: await listFamilies(mosqueId) });
}

/** أسرة جديدة — الاسم واجب فقط */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "families");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    leaderName?: unknown;
    notes?: unknown;
  };
  const name = text(body.name, 100);
  if (!name) return Response.json({ error: "اسم الأسرة مطلوب" }, { status: 400 });

  const family = await createFamily(mosqueId, {
    name,
    leaderName: text(body.leaderName, 100),
    notes: text(body.notes, 1000),
  });
  return Response.json({ family }, { status: 201 });
}
