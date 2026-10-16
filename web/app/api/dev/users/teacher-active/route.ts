import { devConsoleGate } from "@/lib/dev-gate";
import { setTeacherActiveAny } from "@/lib/dev-db";
import { logDevAction } from "@/lib/dev-audit";

/**
 * إيقاف/إعادة تفعيل أي معلّم من اللوحة — بما فيهم المشرفون، بعكس مسار
 * STEP 60 المقيَّد بمساعدي حلقة المستدعي. الإيقاف يُسقط جلساته فوراً.
 */
export async function POST(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { teacherId?: unknown; active?: unknown };
  const teacherId = Number(body.teacherId);
  if (!Number.isInteger(teacherId)) return Response.json({ error: "معرّف غير صحيح" }, { status: 400 });
  if (typeof body.active !== "boolean") return Response.json({ error: "قيمة غير صحيحة" }, { status: 400 });

  const updated = await setTeacherActiveAny(teacherId, body.active);
  if (!updated) return Response.json({ error: "لا يوجد معلّم بهذا المعرّف" }, { status: 404 });

  await logDevAction(body.active ? "teacher_reactivate" : "teacher_deactivate", "teacher", teacherId, {
    via: "dev-console",
  });
  return Response.json({ ok: true });
}
