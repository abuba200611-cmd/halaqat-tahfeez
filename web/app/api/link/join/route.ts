import { joinHalaqahByInviteCode } from "@/lib/db";

/**
 * نداء خادم لخادم من tasjeel-tullab بعد أن يسجّل طالب حسابه عبر رابط
 * دعوة حلقة: ينشئ سجل الطالب بحلقة المعلّم فوراً ويربطه، بلا أي إدخال
 * يدوي من المعلّم. محمي بنفس السرّ المشترك (x-link-secret).
 */
export async function POST(request: Request) {
  const secret = request.headers.get("x-link-secret");
  if (!secret || secret !== process.env.LINK_SECRET) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    inviteCode?: unknown;
    studentName?: unknown;
    linkUsername?: unknown;
  };
  const inviteCode = String(body.inviteCode ?? "").trim();
  const studentName = String(body.studentName ?? "").trim();
  const linkUsername = String(body.linkUsername ?? "").trim();
  if (!inviteCode || !studentName || !linkUsername) {
    return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const result = await joinHalaqahByInviteCode(inviteCode, studentName, linkUsername);
  if (!result) return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });

  return Response.json({ ok: true });
}
