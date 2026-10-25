import { devConsoleGate } from "@/lib/dev-gate";
import { runRetentionCleanup } from "@/lib/retention";
import { logDevAction } from "@/lib/dev-audit";
import { logServerError } from "@/lib/dev-error-log";
import { RETENTION_RULES } from "@/lib/retention-rules";

/** القواعد المطبَّقة (للعرض قبل التنفيذ) — بلا SQL */
export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;
  return Response.json({ rules: RETENTION_RULES.map(({ key, label }) => ({ key, label })) });
}

/**
 * تنظيف الاحتفاظ: يحذف البيانات المنتهية حسب lib/retention-rules.ts (رموز
 * منتهية، عدّادات قديمة، طلبات حذف مبتوت فيها قديمة…). المشرف العام فقط
 * من مستضيف اللوحة، ويُسجَّل الإجراء بعدده في سجل التدقيق.
 */
export async function POST() {
  const gate = await devConsoleGate();
  if (gate) return gate;

  try {
    const results = await runRetentionCleanup();
    const total = results.reduce((sum, r) => sum + r.deleted, 0);
    const counts = Object.fromEntries(results.map((r) => [r.key, r.error ? "error" : r.deleted]));
    await logDevAction("retention_cleanup", "system", "retention", { total, ...counts });
    return Response.json({ ok: true, total, results });
  } catch (error) {
    await logServerError("dev:retention", error);
    return Response.json({ error: "تعذّر التنظيف" }, { status: 500 });
  }
}
