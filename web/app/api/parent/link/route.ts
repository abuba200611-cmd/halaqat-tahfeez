import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { consumeParentLinkToken, peekParentLinkToken } from "@/lib/parent-db";

const INVALID = "الرابط غير صالح أو منتهي أو سبق استخدامه — اطلب رابطاً جديداً";

/** شاشة التأكيد: اسم الطالب والحلقة لرمز صالح — لا يُكشف شيء لغير ولي أمر مسجّل الدخول */
export async function GET(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  const token = new URL(request.url).searchParams.get("token")?.trim() ?? "";
  const info = token ? await peekParentLinkToken(token) : null;
  if (!info) return Response.json({ error: INVALID }, { status: 404 });
  return Response.json(info);
}

/** تأكيد الربط: يستهلك الرمز (لمرة واحدة) وينشئ الربط بذرّية */
export async function POST(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const token = String(body.token ?? "").trim();
  const linked = token ? await consumeParentLinkToken(token, parent.id) : null;
  if (!linked) return Response.json({ error: INVALID }, { status: 404 });
  return Response.json({ ok: true, child: { halaqahId: linked.halaqahId, studentId: linked.studentId } });
}
