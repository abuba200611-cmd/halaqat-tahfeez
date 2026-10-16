import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { seedSuggestedCriteria } from "@/lib/mosque/db";

/** يضيف المعايير المقترحة الناقصة فقط (الحضور، الحفظ، المراجعة…) ولا يكرر الموجود */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "weekly_evaluation");
  if (gate) return gate;

  return Response.json({ criteria: await seedSuggestedCriteria(mosqueId) });
}
