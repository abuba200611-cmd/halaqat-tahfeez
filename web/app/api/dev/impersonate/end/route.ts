import { isAdmin, unauthorized } from "@/lib/mosque/admin-auth";
import { endImpersonation } from "@/lib/dev-impersonation";
import { logDevAction } from "@/lib/dev-audit";

/**
 * إنهاء «عرض كـ»: يحذف كوكي الادعاء وكوكي جلسة الدور المنتحَل فتعود
 * الجلسة أدمن (لم تُمسّ أبداً). يقبل الادعاء حتى منتهياً ليعرف أي كوكي
  دور يمسح.
 */
export async function POST() {
  if (!(await isAdmin())) return unauthorized();

  const info = await endImpersonation();
  if (!info) return Response.json({ ok: true, ended: false });

  await logDevAction("impersonate_end", info.kind, info.targetId, {});
  return Response.json({ ok: true, ended: true });
}
