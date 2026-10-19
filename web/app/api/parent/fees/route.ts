import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { listParentChildren } from "@/lib/parent-db";
import { getMosque, isFeatureEnabled } from "@/lib/mosque/db";
import { FEES_FEATURE_KEY } from "@/lib/fees";
import { getMosqueIdForHalaqah, listFeesForStudent } from "@/lib/fees-db";
import { logServerError } from "@/lib/dev-error-log";

/*
  رسوم أبناء ولي الأمر — قراءة فقط. لا يُقبل أي معرّف من العميل: الأبناء
  يُقرؤون من جدول الربط بحساب الولي في الجلسة، فلا طريق لطالب غير مرتبط به
  (لا IDOR). الابن لا يظهر إلا إذا كانت الميزة مفعّلة لجامع حلقته.
  ?check=1 يرجع { enabled } فقط (لإظهار الرابط في شريط الولي).
*/
export async function GET(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  try {
    const children = await listParentChildren(parent.id);
    const mosqueCache = new Map<number, { enabled: boolean; name: string }>();
    const result = [];

    for (const child of children) {
      const mosqueId = await getMosqueIdForHalaqah(child.halaqahId);
      if (mosqueId === null) continue;
      let mosque = mosqueCache.get(mosqueId);
      if (!mosque) {
        const enabled = await isFeatureEnabled(mosqueId, FEES_FEATURE_KEY);
        mosque = { enabled, name: enabled ? ((await getMosque(mosqueId))?.name ?? "") : "" };
        mosqueCache.set(mosqueId, mosque);
      }
      if (!mosque.enabled) continue;
      // ملاحظات الإدارة الداخلية (notes) لا تصل ولي الأمر
      const fees = (await listFeesForStudent(child.halaqahId, child.studentId)).map((fee) => ({
        id: fee.id,
        planName: fee.planName,
        periodLabel: fee.periodLabel,
        amountDueCents: fee.amountDueCents,
        amountPaidCents: fee.amountPaidCents,
        status: fee.status,
        dueDate: fee.dueDate,
        payments: fee.payments.map((p) => ({
          id: p.id,
          amountCents: p.amountCents,
          paidAt: p.paidAt,
          method: p.method,
          receiptNo: p.receiptNo,
          note: p.note,
        })),
      }));
      result.push({ ...child, mosqueName: mosque.name, fees });
    }

    if (new URL(request.url).searchParams.get("check") === "1") {
      return Response.json({ enabled: result.length > 0 });
    }
    return Response.json({ enabled: result.length > 0, children: result });
  } catch (error) {
    await logServerError("parent-fees:get", error);
    throw error;
  }
}
