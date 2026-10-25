import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { getMosque, isFeatureEnabled, listScheduleSlots } from "@/lib/mosque/db";

/**
 * الجدول الأسبوعي للعرض العام (رابط المشاركة /j/{id}/schedule) — بلا جلسة:
 * الاسم والخانات فقط، و404 إن لم يوجد الجامع أو كانت الميزة معطّلة.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // مسار عام بلا جلسة: حدّ لكل IP يمنع مسح معرّفات الجوامع بالجملة
  if (!(await checkRateLimit(`public-schedule:${clientIp(request)}`, 120, 60))) return rateLimited();
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();

  const mosque = await getMosque(mosqueId);
  if (!mosque) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  if (!(await isFeatureEnabled(mosqueId, "weekly_schedule"))) {
    return Response.json({ error: "الجدول غير متاح لهذا الجامع" }, { status: 404 });
  }

  // حقول الجدول العامة فقط — بلا mosqueId/refId/createdAt الداخلية
  const slots = (await listScheduleSlots(mosqueId)).map(
    ({ id, dayOfWeek, period, startTime, title, programKind, location, notes }) => ({
      id,
      dayOfWeek,
      period,
      startTime,
      title,
      programKind,
      location,
      notes,
    }),
  );
  return Response.json({ name: mosque.name, city: mosque.city, slots });
}
