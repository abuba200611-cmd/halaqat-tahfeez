import { consumeEmailVerification } from "@/lib/db";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: unknown };
  const token = String(body.token ?? "").trim();
  if (!token) return Response.json({ error: "رمز التأكيد مفقود" }, { status: 400 });

  const teacherId = await consumeEmailVerification(token);
  if (!teacherId) {
    return Response.json({ error: "الرابط منتهي أو مستخدم من قبل" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
