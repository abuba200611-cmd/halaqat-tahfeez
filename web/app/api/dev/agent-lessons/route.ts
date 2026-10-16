import { devConsoleGate } from "@/lib/dev-gate";
import { listAgentLessonsForDev } from "@/lib/agent/store";

/** دروس الإيجنت المقترحة من جوامع المنصة — بكل الحالات، للمطوّر فقط */
export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const lessons = await listAgentLessonsForDev();
  return Response.json({
    lessons: lessons.map((lesson) => ({
      id: lesson.id,
      content: lesson.content,
      fromMosqueName: lesson.fromMosqueName,
      status: lesson.status,
      createdAt: lesson.createdAt,
      decidedAt: lesson.decidedAt,
    })),
  });
}
