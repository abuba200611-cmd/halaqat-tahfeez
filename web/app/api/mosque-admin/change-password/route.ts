import { currentMosqueAdmin, setMosqueAdminSessionCookie } from "@/lib/mosque-auth";
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

/** تغيير كلمة مرور مدير الجامع — updateMosqueAdminPassword يرفع session_version (يُخرج الأجهزة الأخرى)، ونعيد إصدار كوكي هذا الجهاز */
export async function POST(request: Request) {
  const admin = await currentMosqueAdmin();
  if (!admin) return unauthorized();

  return handlePasswordChange(request, {
    scope: "mosque-admin",
    sessionId: admin.id,
    loadHash: () => mosqueAdminPasswordHash(admin.id),
    apply: async (hash) => {
      await updateMosqueAdminPassword(admin.id, hash);
      await setMosqueAdminSessionCookie(admin.id);
    },
  });
}
