import { featureGateAny, text, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { createMosqueMember, listMosqueMembers, listPendingStudents, type MosqueMember } from "@/lib/mosque/db";

/*
  دليل أفراد الجامع: الطلاب (pending_students) + الأعضاء الأحرار —
  تخدمه الأسر واللجان والأوسمة معاً، فالبوابة تكتفي بإحداها.
*/

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGateAny(mosqueId, ["families", "committees", "badges"]);
  if (gate) return gate;

  const [students, members] = await Promise.all([
    listPendingStudents(mosqueId),
    listMosqueMembers(mosqueId),
  ]);
  return Response.json({ students, members });
}

/** عضو حر جديد (ولي أمر/متطوع) — الاسم فقط واجب */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGateAny(mosqueId, ["families", "committees", "badges"]);
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    name?: unknown;
    phone?: unknown;
    roleNote?: unknown;
  };
  const name = text(body.name, 100);
  if (!name) return Response.json({ error: "الاسم مطلوب" }, { status: 400 });

  const member: MosqueMember = await createMosqueMember(mosqueId, {
    name,
    phone: text(body.phone, 30),
    roleNote: text(body.roleNote, 200),
  });
  return Response.json({ member }, { status: 201 });
}
