import { currentTeacher, unauthorized } from "@/lib/auth";
import { createEmailVerification } from "@/lib/db";
import { sendMail } from "@/lib/mail";

export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.emailVerified) return Response.json({ ok: true });

  const token = await createEmailVerification(teacher.id);
  const origin = new URL(request.url).origin;
  const link = `${origin}/verify-email?token=${token}`;
  await sendMail(
    teacher.username,
    "أكّد بريدك — حلقات",
    `<div dir="rtl" style="font-family:sans-serif"><p><a href="${link}">اضغط هنا لتأكيد البريد</a> (صالح ٢٤ ساعة).</p></div>`,
  );
  return Response.json({ ok: true });
}
