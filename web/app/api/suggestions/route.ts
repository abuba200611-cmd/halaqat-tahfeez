import { currentTeacher, unauthorized } from "@/lib/auth";
import { addSuggestion, type SuggestionType } from "@/lib/db";

const MAX_LENGTH = 1000;

export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { message?: unknown; type?: unknown };
  const message = String(body.message ?? "").trim().slice(0, MAX_LENGTH);
  const type: SuggestionType = body.type === "problem" ? "problem" : "suggestion";
  if (!message) {
    return Response.json(
      { error: type === "problem" ? "اشرح المشكلة أولاً" : "اكتب اقتراحك أولاً" },
      { status: 400 },
    );
  }

  await addSuggestion(teacher.id, `${teacher.halaqahName || "حلقة"} (${teacher.username})`, message, type);
  return Response.json({ ok: true });
}
