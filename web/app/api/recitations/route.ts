import { currentTeacher, unauthorized } from "@/lib/auth";
import { countPendingRecitations, listHalaqahRecitations } from "@/lib/recitations-db";

/*
  STEP 64 — تلاوات الحلقة لمعلّميها. الحلقة من الجلسة فقط.
  ?count=1 → عدد المعلّقة فقط (لوسم القائمة الجانبية، خفيف).
*/
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  if (new URL(request.url).searchParams.get("count") === "1") {
    return Response.json({ pendingCount: await countPendingRecitations(teacher.halaqahId) });
  }

  const recitations = await listHalaqahRecitations(teacher.halaqahId);
  return Response.json({
    recitations,
    pendingCount: recitations.filter((r) => r.status === "pending").length,
  });
}
