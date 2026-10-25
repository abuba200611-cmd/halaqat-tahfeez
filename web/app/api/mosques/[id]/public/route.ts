import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { getMosque, isFeatureEnabled } from "@/lib/mosque/db";

/** اسم الجامع فقط — لصفحة التسجيل العامة، بلا حاجة لجلسة مشرف؛ وتعطيل "التسجيل العام" يخفي الرابط */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // مسار عام بلا جلسة: حدّ لكل IP يمنع مسح معرّفات الجوامع بالجملة
  if (!(await checkRateLimit(`public-mosque:${clientIp(request)}`, 120, 60))) return rateLimited();
  const id = parsePositiveIntParam((await params).id);
  if (id === null) return paramNotFound();
  const mosque = await getMosque(id);
  if (!mosque) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  if (!(await isFeatureEnabled(id, "registration"))) {
    return Response.json({ error: "رابط التسجيل غير مفعّل" }, { status: 404 });
  }
  return Response.json({ name: mosque.name, city: mosque.city });
}
