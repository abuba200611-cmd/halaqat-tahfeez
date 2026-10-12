import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { seedSuggestedBadges } from "@/lib/mosque/db";

/** يضيف مقترحات الأوسمة الناقصة فقط (تعارض الاسم يتجاهل) ويعيد الأوسمة كلها */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "badges");
  if (gate) return gate;

  return Response.json({ badges: await seedSuggestedBadges(mosqueId) });
}
