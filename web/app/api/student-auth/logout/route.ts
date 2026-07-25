import { clearStudentSessionCookie } from "@/lib/auth";

export async function POST() {
  await clearStudentSessionCookie();
  return Response.json({ ok: true });
}
