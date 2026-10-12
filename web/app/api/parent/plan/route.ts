import { hijriMonthOfISO } from "@/lib/hijri";
import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { getParentChild } from "@/lib/parent-db";
import { getStudentPlanView } from "@/lib/plan-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * خطة ابن واحد للشهر الهجري الحالي: ?halaqahId=<id>&studentId=<id>. نفس قاعدة
 * /api/parent/attendance — الاستعلام يربط الطالب بالولي المسجَّل، وأي طالب
 * غير مرتبط به يرجع 404 متطابقاً.
 */
export async function GET(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  const params = new URL(request.url).searchParams;
  const halaqahId = Number(params.get("halaqahId"));
  const studentId = params.get("studentId")?.trim() ?? "";
  const NOT_FOUND = Response.json({ error: "غير موجود" }, { status: 404 });
  if (!Number.isInteger(halaqahId) || !studentId) return NOT_FOUND;

  const child = await getParentChild(parent.id, halaqahId, studentId);
  if (!child) return NOT_FOUND;

  const today = riyadhTodayISO();
  const view = await getStudentPlanView(child.halaqahId, child.studentId, hijriMonthOfISO(today), today);
  return Response.json({ plan: view });
}
