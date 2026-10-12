import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { listParentChildren } from "@/lib/parent-db";

/** أبناء ولي الأمر المسجّل فقط — الاسم والحلقة */
export async function GET() {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  return Response.json({ children: await listParentChildren(parent.id) });
}
