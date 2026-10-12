import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque, isFeatureEnabled, linkHalaqahByInviteCode } from "@/lib/mosque/db";

/**
 * يضيف حلقة للجامع برمز دعوة طلابها (إضافة يدوية من المدير): الحلقة
 * موجودة أصلاً بقاعدة الحلقات، فيُحدَّث halaqahs.mosque_id مباشرة بعد
 * التحقق من الرمز — اسم الحلقة والمعلّم يأتيان منها لا من إدخال يدوي.
 * الطريق الأساسي لانضمام الحلقة هو رابط /join-mosque الذي يفتحه مشرفها.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  if (!(await isFeatureEnabled(mosqueId, "halaqat"))) {
    return Response.json({ error: "الحلقات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { inviteCode?: unknown };
  const inviteCode = String(body.inviteCode ?? "").trim();
  if (!inviteCode) return Response.json({ error: "رمز الدعوة مطلوب" }, { status: 400 });

  const linked = await linkHalaqahByInviteCode(mosqueId, inviteCode);
  if (!linked.ok) {
    return linked.reason === "conflict"
      ? Response.json({ error: "هذي الحلقة مضافة أصلاً لجامع آخر" }, { status: 409 })
      : Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 400 });
  }
  const { halaqah } = linked;
  return Response.json({
    ok: true,
    alreadyLinked: linked.alreadyLinked,
    id: halaqah.id,
    halaqahName: halaqah.halaqahName,
    teacherName: halaqah.teacherName,
  });
}
