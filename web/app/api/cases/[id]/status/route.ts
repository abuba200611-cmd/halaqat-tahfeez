import { currentTeacher, unauthorized } from "@/lib/auth";
import { setCaseStatus } from "@/lib/case-db";
import { parseCaseId, parseStatusBody } from "@/lib/case-study";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/* STEP 65 — إغلاق/إعادة فتح. إعادة الفتح مع وجود حالة مفتوحة أخرى للطالب = 409. */

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`cases-status:${teacher.id}`, 300, 3600))) return rateLimited();

  const caseId = parseCaseId((await params).id);
  if (caseId === null) return bad("غير موجود", 404);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const parsed = parseStatusBody(body);
  if (!parsed.ok) return bad(parsed.error);

  const result = await setCaseStatus(teacher.halaqahId, caseId, parsed.status);
  if (result.kind === "not_found") return bad("غير موجود", 404);
  if (result.kind === "conflict") {
    return Response.json({ error: "للطالب حالة مفتوحة أخرى", caseId: result.openCaseId }, { status: 409 });
  }
  return Response.json({ ok: true, status: parsed.status });
}
