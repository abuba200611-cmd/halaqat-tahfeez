import { currentTeacher, unauthorized } from "@/lib/auth";
import { templateResponse } from "@/lib/enrollment-api";

/** قالب CSV للمعلّم (بلا عمود الحلقة) */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  return templateResponse(false);
}
