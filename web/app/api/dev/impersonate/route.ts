import { isAdmin, unauthorized } from "@/lib/mosque/admin-auth";
import { currentImpersonation, startImpersonation } from "@/lib/dev-impersonation";
import { logDevAction } from "@/lib/dev-audit";

/**
 * بدء «عرض كـ» لمعلم أو مدير جامع — أدمن فقط، وواحد نشط في كل مرة.
 * adminId في الادعاء = ٠ لأن جلسة ADMIN_SECRET بلا هوية رقمية (سرّ
  واحد للمطوّر) — الادعاء imp=1 هو ما تعتمد عليه الحواجج، لا رقم الأدمن.
 */
export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();
  if (await currentImpersonation()) {
    return Response.json({ error: "أنهِ جلسة «عرض كـ» الحالية أولاً" }, { status: 409 });
  }

  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; id?: unknown };
  const kind = body.kind;
  if (kind !== "teacher" && kind !== "mosque_admin") {
    return Response.json({ error: "نوع غير معروف" }, { status: 400 });
  }
  const targetId = Number(body.id);
  if (!Number.isInteger(targetId)) return Response.json({ error: "معرّف غير صحيح" }, { status: 400 });

  const label = await startImpersonation(kind, targetId, 0);
  if (label === null) return Response.json({ error: "الهدف غير موجود" }, { status: 404 });

  await logDevAction("impersonate_start", kind, targetId, { label });
  return Response.json({ ok: true, label });
}
