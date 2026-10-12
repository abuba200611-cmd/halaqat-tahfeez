import { clientIp } from "@/lib/client-ip";
import { addMosqueRegistration, getMosque, isFeatureEnabled } from "@/lib/mosque/db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

const MAX_PER_HOUR = 20;
const WINDOW_SECONDS = 60 * 60;

/** تسجيل عام عبر رابط الجامع — بلا اختيار حلقة، بلا حساب/كلمة مرور؛ ويتبع ميزة "التسجيل العام" */
export async function POST(request: Request) {
  // endpoint عام بلا حساب — حدّ لكل IP يقيّد الإغراق (حدّ كريم: جامع بشبكة واحدة يسجّل منه عدة طلاب)
  if (!(await checkRateLimit(`mosque-register:${clientIp(request)}`, MAX_PER_HOUR, WINDOW_SECONDS))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { mosqueId?: unknown; name?: unknown; phone?: unknown };
  const mosqueId = Number(body.mosqueId);
  const name = String(body.name ?? "").trim().slice(0, 100);
  const phone = String(body.phone ?? "").trim().slice(0, 30);

  if (!Number.isInteger(mosqueId) || !(await getMosque(mosqueId))) {
    return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  }
  if (!(await isFeatureEnabled(mosqueId, "registration"))) {
    return Response.json({ error: "رابط التسجيل غير مفعّل حالياً" }, { status: 404 });
  }
  if (!name) return Response.json({ error: "الاسم مطلوب" }, { status: 400 });

  await addMosqueRegistration(mosqueId, name, phone);
  return Response.json({ ok: true });
}
