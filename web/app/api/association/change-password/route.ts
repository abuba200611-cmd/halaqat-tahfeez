import { currentAssociationAdmin, setAssociationAdminSessionCookie } from "@/lib/association-auth";
import {
  associationAdminPasswordHash,
  findAssociationAdminById,
  resetAssociationAdminPassword,
} from "@/lib/association-db";
import { handlePasswordChange, passwordInfoResponse } from "@/lib/password-change";

function unauthorized(): Response {
  return Response.json({ error: "غير مصرّح" }, { status: 401 });
}

export async function GET() {
  const admin = await currentAssociationAdmin();
  if (!admin) return unauthorized();
  return passwordInfoResponse(await associationAdminPasswordHash(admin.id));
}

/** تغيير كلمة مرور مدير الجمعية — resetAssociationAdminPassword يرفع session_version، ونعيد إصدار كوكي هذا الجهاز */
export async function POST(request: Request) {
  const admin = await currentAssociationAdmin();
  if (!admin) return unauthorized();

  return handlePasswordChange(request, {
    scope: "association",
    sessionId: admin.id,
    loadHash: () => associationAdminPasswordHash(admin.id),
    apply: async (hash) => {
      await resetAssociationAdminPassword(admin.id, hash);
      const fresh = await findAssociationAdminById(admin.id);
      if (fresh) await setAssociationAdminSessionCookie(fresh.id, fresh.sessionVersion);
    },
  });
}
