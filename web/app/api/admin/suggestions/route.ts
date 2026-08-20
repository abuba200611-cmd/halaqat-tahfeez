import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { listSuggestions, type Suggestion } from "@/lib/db";
import { listStudentSuggestions } from "@/lib/tasjeel-db";
import { ADMIN_COOKIE } from "../login/route";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET() {
  const store = await cookies();
  const session = store.get(ADMIN_COOKIE)?.value;
  const expected = process.env.ADMIN_SECRET ?? "";

  if (!expected || !session || !safeEqual(session, expected)) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  // اقتراحات الطلاب اختيارية — لو TASJEEL_DB_URL غير مضبوط، نعرض اقتراحات
  // المعلّمين وحدها بدل ما نكسر الصفحة كاملة.
  const [teacherSuggestions, studentSuggestions] = await Promise.all([
    listSuggestions(),
    listStudentSuggestions().catch(() => [] as Suggestion[]),
  ]);

  const merged: Suggestion[] = [
    ...teacherSuggestions.map((s) => ({ ...s, source: "teacher" as const })),
    ...studentSuggestions.map((s) => ({ ...s, source: "student" as const })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return Response.json({ suggestions: merged });
}
