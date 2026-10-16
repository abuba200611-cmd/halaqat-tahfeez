import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import {
  claimRegistration,
  getHalaqah,
  getMosqueRegistration,
  isFeatureEnabled,
  releaseRegistration,
  setRegistrationStudent,
} from "@/lib/mosque/db";
import { addStudentToHalaqah } from "@/lib/mosque/halaqat";
import { logServerError } from "@/lib/dev-error-log";

/**
 * يوزّع تسجيلاً بانتظار التوزيع على حلقة من حلقات الجامع: يُحجز التسجيل
 * ذرّياً، ثم يُنشأ الطالب فعلياً بحلقته (استدعاء مباشر لقاعدة الحلقات)،
 * ثم يُربط التسجيل بمعرّف الطالب الحقيقي. فشل الإنشاء يُرجع الحجز.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { registrationId?: unknown; pendingId?: unknown; halaqahId?: unknown };
  // pendingId: اسم الحقل القديم بواجهة نظام الجامع — يبقى مقبولاً للتوافق
  const registrationId = Number(body.registrationId ?? body.pendingId);
  const halaqahId = Number(body.halaqahId);

  if (!Number.isSafeInteger(registrationId) || !Number.isSafeInteger(halaqahId)) {
    return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const registration = await getMosqueRegistration(registrationId);
  if (!registration) return Response.json({ error: "الطالب غير موجود" }, { status: 404 });
  if (!(await canAccessMosque(registration.mosqueId))) return unauthorized();
  if (!(await isFeatureEnabled(registration.mosqueId, "halaqat"))) {
    return Response.json({ error: "الحلقات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }
  if (registration.status === "assigned") return Response.json({ error: "هذا الطالب موزَّع أصلاً" }, { status: 409 });

  const halaqah = await getHalaqah(halaqahId);
  if (!halaqah || halaqah.mosqueId !== registration.mosqueId) {
    return Response.json({ error: "الحلقة غير موجودة" }, { status: 404 });
  }

  if (!(await claimRegistration(registration.id, halaqah.id))) {
    return Response.json({ error: "هذا الطالب موزَّع أصلاً" }, { status: 409 });
  }
  let studentId: string;
  try {
    studentId = await addStudentToHalaqah(halaqah.id, registration.name);
  } catch (error) {
    await logServerError("assign:post", error);
    await releaseRegistration(registration.id);
    return Response.json({ error: "تعذّر إضافة الطالب للحلقة — حاول مرة ثانية" }, { status: 500 });
  }
  await setRegistrationStudent(registration.id, studentId);
  return Response.json({ ok: true });
}
