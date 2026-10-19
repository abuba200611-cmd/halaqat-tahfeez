import { handleImport, importGate } from "@/lib/enrollment-api";

/** فحص تفعيل الميزة وصلاحية الدخول (تستعمله الصفحة لتقرير العرض) */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await importGate((await params).id);
  if (ctx instanceof Response) return ctx;
  return Response.json({ ok: true });
}

/** استيراد طلاب الجامع من .xlsx/.csv (مدير الجامع أو المشرف العام) — معاينة ثم تأكيد، الخادم يعيد التحقق */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await importGate((await params).id);
  if (ctx instanceof Response) return ctx;
  return handleImport(request, { mosqueId: ctx.mosqueId, scope: { kind: "admin" }, rateKey: `mosque:${ctx.mosqueId}` });
}
