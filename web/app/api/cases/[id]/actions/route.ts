import { currentTeacher, unauthorized } from "@/lib/auth";
import { addCaseAction } from "@/lib/case-db";
import { parseActionBody, parseCaseId } from "@/lib/case-study";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { riyadhTodayISO } from "@/lib/riyadh-date";

/* STEP 65 — سجلّ المتابعة: إضافة إجراء. حالة حلقة أخرى = 404 بلا كتابة. */

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`cases-action:${teacher.id}`, 300, 3600))) return rateLimited();

  const caseId = parseCaseId((await params).id);
  if (caseId === null) return bad("غير موجود", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseActionBody(body);
  if (!parsed.ok) return bad(parsed.error);

  const action = await addCaseAction(
    teacher.halaqahId,
    caseId,
    teacher.id,
    parsed.actionDate ?? riyadhTodayISO(),
    parsed.action,
    parsed.result,
  );
  if (!action) return bad("غير موجود", 404);
  return Response.json({ ok: true, action }, { status: 201 });
}
