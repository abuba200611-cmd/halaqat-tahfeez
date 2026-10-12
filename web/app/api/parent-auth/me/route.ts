import { currentParent } from "@/lib/parent-auth";

/** هوية ولي الأمر الحالي — الاسم والبريد فقط، أو null */
export async function GET() {
  const parent = await currentParent();
  return Response.json({ parent: parent ? { id: parent.id, name: parent.name, email: parent.email } : null });
}
