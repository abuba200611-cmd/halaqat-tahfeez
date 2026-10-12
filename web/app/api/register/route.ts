import { addPendingStudent, getMosque, isFeatureEnabled } from "@/lib/mosque/db";

/** تسجيل عام عبر رابط الجامع — بلا اختيار حلقة، بلا حساب/كلمة مرور؛ ويتبع ميزة "التسجيل العام" */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { mosqueId?: unknown; name?: unknown; phone?: unknown };
  const mosqueId = Number(body.mosqueId);
  const name = String(body.name ?? "").trim();
  const phone = String(body.phone ?? "").trim();

  if (!Number.isInteger(mosqueId) || !(await getMosque(mosqueId))) {
    return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  }
  if (!(await isFeatureEnabled(mosqueId, "registration"))) {
    return Response.json({ error: "رابط التسجيل غير مفعّل حالياً" }, { status: 404 });
  }
  if (!name) return Response.json({ error: "الاسم مطلوب" }, { status: 400 });

  await addPendingStudent(mosqueId, name, phone);
  return Response.json({ ok: true });
}
