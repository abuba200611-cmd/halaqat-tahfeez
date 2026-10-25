import { logServerError } from "@/lib/dev-error-log";
import { exportAttendanceRows, exportProgressRows, exportStudentsRows } from "@/lib/api-v1-db";
import { buildCsv } from "@/lib/csv";
import { integrationsGate, integrationsWriteGuard } from "@/lib/integrations-api";
import { paramNotFound } from "@/lib/mosque/api-gate";

const KINDS = {
  students: { header: ["المعرّف", "الاسم", "الحلقة", "فعّال"], rows: exportStudentsRows },
  attendance: { header: ["التاريخ", "الحلقة", "الطالب", "الحالة"], rows: exportAttendanceRows },
  progress: {
    header: ["التاريخ", "الحلقة", "الطالب", "الحالة", "الحفظ من", "الحفظ إلى", "المراجعة من", "المراجعة إلى"],
    rows: exportProgressRows,
  },
} as const;

/** تصدير CSV (students | attendance | progress) لجامع المسار فقط، مع منع حقن الصيغ */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const { id, kind } = await params;
  const ctx = await integrationsGate(id);
  if (ctx instanceof Response) return ctx;
  if (!Object.hasOwn(KINDS, kind)) return paramNotFound();
  const spec = KINDS[kind as keyof typeof KINDS];

  try {
    const guard = await integrationsWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;
    const rows = await spec.rows(ctx.mosqueId);
    const today = new Date().toISOString().slice(0, 10);
    return new Response(buildCsv(spec.header, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${kind}-${ctx.mosqueId}-${today}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    await logServerError("mosque-integrations:export", error);
    throw error;
  }
}
