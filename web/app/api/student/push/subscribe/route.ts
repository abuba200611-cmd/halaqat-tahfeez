import { currentStudent, studentUnauthorized } from "@/lib/auth";
import { saveStudentPushSubscription } from "@/lib/db";
import { getVapidPublicKey } from "@/lib/push";

/**
 * المفتاح العام لـ VAPID لجهاز الطالب — نفس المفتاح الذي يستخدمه المعلّم
 * فعلياً (زوج مفاتيح واحد للتطبيق كله، مُولَّد ومخزَّن مرة في lib/push.ts؛
 * لا يوجد NEXT_PUBLIC_VAPID_PUBLIC_KEY كمتغيّر بيئة منفصل بهذا المشروع).
 */
export async function GET() {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  const publicKey = await getVapidPublicKey();
  if (!publicKey) return Response.json({ error: "الإشعارات غير متاحة" }, { status: 503 });
  return Response.json({ publicKey });
}

/**
 * حفظ اشتراك جهاز الطالب. teacherId وstudentId من الجلسة حصراً — أي
 * قيمة بهذين الاسمين داخل جسم الطلب تُتجاهَل تماماً ولا تُقرأ إطلاقاً.
 */
export async function POST(request: Request) {
  const student = await currentStudent();
  if (!student) return studentUnauthorized();

  try {
    const body = (await request.json()) as { subscription?: unknown };
    const sub = body.subscription as
      | { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }
      | undefined;

    const endpoint = String(sub?.endpoint ?? "").trim();
    const p256dh = String(sub?.keys?.p256dh ?? "").trim();
    const auth = String(sub?.keys?.auth ?? "").trim();
    if (!endpoint || !p256dh || !auth) throw new Error("بيانات الاشتراك ناقصة");

    await saveStudentPushSubscription(student.teacherId, student.id, { endpoint, p256dh, auth });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر تفعيل الإشعارات" },
      { status: 400 },
    );
  }
}
