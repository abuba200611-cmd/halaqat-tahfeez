import { listAssociations } from "@/lib/association-db";
import { logServerError } from "@/lib/dev-error-log";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/**
 * قائمة الجمعيات (المعرّف والاسم فقط) لنموذج «تسجيل جامع» العام ليختار منها
 * مقدّم الطلب جمعيته. لا بيانات حسّاسة هنا: اسم الجمعية معلن أصلاً.
 */
export async function GET(request: Request) {
  if (!(await checkRateLimit(`public-associations:${clientIp(request)}`, 60, 60))) return rateLimited();
  try {
    const list = await listAssociations();
    return Response.json({ associations: list.map((a) => ({ id: a.id, name: a.name })) });
  } catch (error) {
    await logServerError("associations:public", error);
    return Response.json({ associations: [] });
  }
}
