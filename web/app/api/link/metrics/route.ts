import { findHalaqahByInviteCode } from "@/lib/db";
import { requireLinkSecret } from "@/lib/link-auth";
import { parseMetricsRange } from "@/lib/metrics";
import { getHalaqahMetrics } from "@/lib/metrics-db";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/**
 * مقاييس حلقة كاملة لنظام إدارة الجامع (أوراد، حضور، خطة شهر، تلاوات،
 * درجة تفاعل) — نداء خادم لخادم محمي بالسرّ المشترك، يُقرأ برمز دعوة
 * الطلاب؛ الحلقة تُحلّ من الرمز وحده لا من أي معرّف يمرّره المستدعي.
 * النطاق الافتراضي آخر ٣٠ يوماً تنتهي اليوم بتوقيت الرياض (حدّ ١٢٠
 * يوماً). أسماء وأرقام فقط — لا هواتف ولا حسابات ولا ملاحظات.
 */
export async function GET(request: Request) {
  const denied = await requireLinkSecret(request, "link/metrics");
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const invite = params.get("invite")?.trim() ?? "";
  if (!invite) return Response.json({ error: "الرمز مفقود" }, { status: 400 });

  const today = riyadhTodayISO();
  const range = parseMetricsRange(params.get("from"), params.get("to"), today);
  if (!range.ok) return Response.json({ error: range.error }, { status: 400 });

  const halaqah = await findHalaqahByInviteCode(invite);
  if (!halaqah) return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });

  return Response.json(
    await getHalaqahMetrics(
      { id: halaqah.id, halaqahName: halaqah.halaqahName, teacherName: halaqah.teacherName },
      { from: range.from, to: range.to },
      today,
    ),
  );
}
