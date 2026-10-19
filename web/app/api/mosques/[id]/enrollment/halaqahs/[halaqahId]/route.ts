import { paramNotFound, parsePositiveIntParam } from "@/lib/mosque/api-gate";
import { enrollmentGate, enrollmentWriteGuard } from "@/lib/enrollment-api";
import { parseCriteria } from "@/lib/enrollment";
import { updateHalaqahCriteria } from "@/lib/mosque/enrollment-db";
import { logServerError } from "@/lib/dev-error-log";

/**
 * يضبط سعة حلقة ومعاييرها: { capacity, minAge, maxAge, level } (كلها اختيارية، null = بلا قيد).
 * الحلقة تُقيَّد بجامع المسار في الاستعلام نفسه، وكل ما اتّسع من مقاعد يُرقّي المنتظرين فوراً.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; halaqahId: string }> }) {
  const { id, halaqahId: rawHalaqahId } = await params;
  const ctx = await enrollmentGate(id);
  if (ctx instanceof Response) return ctx;
  const halaqahId = parsePositiveIntParam(rawHalaqahId);
  if (halaqahId === null) return paramNotFound();

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return Response.json({ error: "بيانات غير صحيحة" }, { status: 400 });
  const criteria = parseCriteria(body);
  if (!criteria.ok) return Response.json({ error: criteria.error }, { status: 400 });

  const limited = await enrollmentWriteGuard(ctx.mosqueId);
  if (limited) return limited;

  try {
    const result = await updateHalaqahCriteria(ctx.mosqueId, halaqahId, criteria.value);
    if (!result) return Response.json({ error: "الحلقة غير موجودة" }, { status: 404 });
    return Response.json({ ok: true, promoted: result.promoted });
  } catch (error) {
    await logServerError("enrollment:criteria", error);
    throw error;
  }
}
