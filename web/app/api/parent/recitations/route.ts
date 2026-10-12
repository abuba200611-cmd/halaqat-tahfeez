import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { getParentChild } from "@/lib/parent-db";
import { listChildRecitations } from "@/lib/recitations-db";

/**
 * STEP 64 — تلاوات ابن واحد (آخر 20، قراءة فقط): ?halaqah=<id>&student=<id>.
 * نفس قاعدة /api/parent/child — أي طالب غير مرتبط بالولي يرجع 404 متطابقاً.
 */
export async function GET(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  const params = new URL(request.url).searchParams;
  const halaqahId = Number(params.get("halaqah"));
  const studentId = params.get("student")?.trim() ?? "";
  const NOT_FOUND = Response.json({ error: "غير موجود" }, { status: 404 });
  if (!Number.isInteger(halaqahId) || !studentId) return NOT_FOUND;

  const child = await getParentChild(parent.id, halaqahId, studentId);
  if (!child) return NOT_FOUND;

  return Response.json({ recitations: await listChildRecitations(child.halaqahId, child.studentId) });
}
