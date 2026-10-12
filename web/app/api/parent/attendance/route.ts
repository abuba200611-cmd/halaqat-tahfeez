import { getAttendanceSummaries } from "@/lib/attendance-db";
import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { getParentChild } from "@/lib/parent-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * ملخّص حضور ابن واحد: ?halaqah=<id>&student=<id>. نفس قاعدة /api/parent/child —
 * الاستعلام يربط الطالب بالولي المسجَّل، وأي طالب غير مرتبط به يرجع 404 متطابقاً.
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

  const summaries = await getAttendanceSummaries(child.halaqahId, riyadhTodayISO(), child.studentId);
  return Response.json({ summary: summaries[child.studentId] ?? null });
}
