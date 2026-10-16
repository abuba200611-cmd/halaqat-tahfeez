import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { getMosque } from "@/lib/mosque/db";
import {
  getDisciplineConfig,
  listActiveSuspensions,
  listMosqueEvents,
  restoreExpiredSuspensions,
} from "@/lib/discipline-db";
import { logServerError } from "@/lib/dev-error-log";

/*
  A2 — لوحة الانضباط لإدارة الجامع: كل أحداث حلقاتها وإيقافاتها السارية
  وتنبيهاتها الحرجة غير المقروءة، مع إعداداتها. الفحص الكسول لاسترجاع
  الإيقافات المنتهية يمرّ هنا أيضاً (قد تفتح الإدارة قبل المعلّمين).
*/

type RouteContext = { params: Promise<{ id: string }> };

/** أحداث الجامع + الإيقافات السارية + الإعدادات */
export async function GET(_request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "discipline");
  if (gate) return gate;

  try {
    await restoreExpiredSuspensions({ mosqueId });
    const [config, events, suspensions, mosque] = await Promise.all([
      getDisciplineConfig(mosqueId),
      listMosqueEvents(mosqueId),
      listActiveSuspensions({ mosqueId }),
      getMosque(mosqueId),
    ]);
    const criticalAlerts = events.filter((e) => e.kind === "admin_alert" && e.acknowledgedAt === null).length;
    return Response.json({ config, events, suspensions, criticalAlerts, mosqueName: mosque?.name ?? "" });
  } catch (error) {
    await logServerError("mosque-discipline:get", error);
    throw error;
  }
}
