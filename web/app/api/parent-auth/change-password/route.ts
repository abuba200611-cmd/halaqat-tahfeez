import { currentParent, parentUnauthorized, setParentSessionCookie } from "@/lib/parent-auth";
import { parentPasswordHash, updateParentPassword } from "@/lib/parent-db";
import { handlePasswordChange, passwordInfoResponse } from "@/lib/password-change";

export async function GET() {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();
  return passwordInfoResponse(await parentPasswordHash(parent.id));
}

/** تغيير كلمة مرور ولي الأمر — يرفع نسخة الجلسة (تسقط الأجهزة الأخرى) ويعيد إصدار كوكي هذا الجهاز */
export async function POST(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  return handlePasswordChange(request, {
    scope: "parent",
    sessionId: parent.id,
    loadHash: () => parentPasswordHash(parent.id),
    apply: async (hash) => {
      await updateParentPassword(parent.id, hash);
      await setParentSessionCookie(parent.id);
    },
  });
}
