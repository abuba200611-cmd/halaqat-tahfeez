import { listAllWardLogsForStudent } from "@/lib/db";
import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { getParentChild } from "@/lib/parent-db";
import { buildParentChildSummary } from "@/lib/parent-summary";
import { reviewTrackConfigForHalaqah } from "@/lib/mosque/review-tracks-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * ملخّص ابن واحد (قراءة فقط): ?halaqah=<id>&student=<id>. الاستعلام يربط
 * الطالب بالولي المسجَّل نفسه، فأي طالب غير مرتبط به (أو غير موجود) يُرجع
 * 404 متطابقاً — لا فرق بين "غير موجود" و"ليس ابنك".
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

  const logs = await listAllWardLogsForStudent(child.halaqahId, child.studentId);
  return Response.json({
    child: { halaqahId: child.halaqahId, studentId: child.studentId, name: child.studentName, halaqahName: child.halaqahName },
    summary: buildParentChildSummary(logs, riyadhTodayISO()),
    reviewTrackConfig: await reviewTrackConfigForHalaqah(child.halaqahId),
  });
}
