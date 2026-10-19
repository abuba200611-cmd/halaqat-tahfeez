import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { getParentChild } from "@/lib/parent-db";
import { listPublishedResultsForStudent } from "@/lib/mosque/exams-db";
import { isFeatureEnabled } from "@/lib/mosque/db";
import { getMosqueIdForHalaqah } from "@/lib/fees-db";

/**
 * نتائج اختبارات ابن واحد المنشورة: ?halaqah=<id>&student=<id> — نفس قاعدة
 * /api/parent/child: أي طالب غير مرتبط بالولي يرجع 404 متطابقاً.
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

  const mosqueId = await getMosqueIdForHalaqah(child.halaqahId);
  if (mosqueId === null || !(await isFeatureEnabled(mosqueId, "exams"))) return NOT_FOUND;

  return Response.json({ results: await listPublishedResultsForStudent(child.halaqahId, child.studentId) });
}
