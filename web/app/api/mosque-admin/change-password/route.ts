import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { mosqueAdminPasswordHash, updateMosqueAdminPassword } from "@/lib/mosque/db";
import { handlePasswordChange, passwordInfoResponse } from "@/lib/password-change";

function unauthorized(): Response {
  return Response.json({ error: "غير مصرّح" }, { status: 401 });
}

export async function GET() {
  const admin = await currentMosqueAdmin();
  if (!admin) return unauthorized();
  return passwordInfoResponse(await mosqueAdminPasswordHash(admin.id));
}

/**
 * تغيير كلمة مرور مدير الجامع. جلسات هذا الدور بلا نسخة جلسة (لا عمود لها)،
 * فلا إبطال للأجهزة الأخرى — الكوكي الحالي يبقى صالحاً.
 */
export async function POST(request: Request) {
  const admin = await currentMosqueAdmin();
  if (!admin) return unauthorized();

  return handlePasswordChange(request, {
    scope: "mosque-admin",
    sessionId: admin.id,
    loadHash: () => mosqueAdminPasswordHash(admin.id),
    apply: (hash) => updateMosqueAdminPassword(admin.id, hash),
  });
}
