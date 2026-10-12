import { featureGate, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { createCommittee, listCommittees } from "@/lib/mosque/db";

/** لجان الجامع مع عدد أعضاء كل لجنة */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  return Response.json({ committees: await listCommittees(mosqueId) });
}

/** لجنة جديدة — الاسم واجب فقط */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "committees");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { name?: unknown; description?: unknown };
  const name = text(body.name, 100);
  if (!name) return Response.json({ error: "اسم اللجنة مطلوب" }, { status: 400 });

  const committee = await createCommittee(mosqueId, {
    name,
    description: text(body.description, 1000),
  });
  return Response.json({ committee }, { status: 201 });
}
