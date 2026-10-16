import { devConsoleGate } from "@/lib/dev-gate";
import { decideAgentLesson } from "@/lib/agent/store";
import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";

/** حسم درس — الموافقة تُشاركه بسياق كل الجوامع، والرفض يدفنه */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const lessonId = parsePositiveIntParam((await params).id);
  if (lessonId === null) return paramNotFound();

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "approve" && body.action !== "reject") {
    return Response.json({ error: "action يجب أن يكون approve أو reject" }, { status: 400 });
  }

  const lesson = await decideAgentLesson(lessonId, body.action === "approve" ? "approved" : "rejected");
  if (!lesson) return Response.json({ error: "الدرس غير موجود أو محسوم سابقاً" }, { status: 409 });

  return Response.json({ lesson: { id: lesson.id, status: lesson.status } });
}
