import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { isAdmin, unauthorized } from "@/lib/mosque/admin-auth";
import { getMosque, getMosqueAdminForMosque, upsertMosqueAdmin } from "@/lib/mosque/db";
import { hashPassword } from "@/lib/mosque/password";
import { guardImpersonation } from "@/lib/dev-impersonation";
import { logDevAction } from "@/lib/dev-audit";

/** حساب مدير هذا الجامع الحالي، إن وُجد — يعرضه المشرف العام بصفحة الجامع */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return unauthorized();
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const admin = await getMosqueAdminForMosque(mosqueId);
  return Response.json({ admin });
}

/** ينشئ حساب مدير للجامع، أو يستبدل الحساب الحالي (اسم مستخدم/كلمة مرور جديدين) */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return unauthorized();
  // تغيير حساب مدير جامع هدّام — ممنوع أثناء «عرض كـ»
  const impBlocked = await guardImpersonation();
  if (impBlocked) return impBlocked;

  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  const username = String(body.username ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  if (!username) return Response.json({ error: "اسم المستخدم مطلوب" }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "كلمة المرور ٨ أحرف فأكثر" }, { status: 400 });

  try {
    await upsertMosqueAdmin(mosqueId, username, hashPassword(password));
  } catch {
    return Response.json({ error: "اسم المستخدم هذا مستخدَم بجامع ثانٍ" }, { status: 409 });
  }
  await logDevAction("admin_account_change", "mosque", mosqueId, { username, via: "dev-console" });
  return Response.json({ ok: true, username });
}
