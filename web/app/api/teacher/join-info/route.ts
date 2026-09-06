import "server-only";
import * as Sentry from "@sentry/nextjs";
import { getDatabase } from "@netlify/database";
import { checkInviteRateLimit, recordFailedInviteAttempt } from "@/lib/db";
import { clientIp } from "@/lib/client-ip";

const ENDPOINT = "teacher/join-info";
const RETRY_AFTER_SECONDS = 60 * 60;

/**
 * اسم الحلقة صاحبة رمز دعوة معلّم — لعرضه قبل التسجيل. بلا حماية جلسة
 * عمداً (الزائر لسه ما سجّل حسابه)، لكنه لا يكشف شيئاً حسّاساً — اسم
 * الحلقة فقط. محمي من التعداد (STEP 33 — F-12): رمز الدعوة ٤٠ بت بلا
 * أي سرّ. خلافاً لـcomplete-invite (حيث الفحص يقع بعد استعلام رمز
 * الدعوة، لأن المهاجم هناك دفع دورة OAuth كاملة قبل أن يصل)، هنا الفحص
 * يقع **قبل** استعلام halaqahs: المهاجم لا يدفع شيئاً للوصول لهذا
 * المسار، والنجاح نادر جداً مقارنة بالفشل تحت أي فيضان — ففحص الحدّ
 * أولاً يوفّر استعلام DB كاملاً على كل طلب مقصوف، بدل مضاعفة الحِمل
 * (استعلام halaqahs ثم استعلام الحدّ) لكل محاولة محجوبة أصلاً.
 */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "الرمز مفقود" }, { status: 400 });

  const ip = clientIp(request);
  try {
    if (!(await checkInviteRateLimit(ip))) {
      return Response.json(
        { error: "محاولات كثيرة، حاول لاحقاً" },
        { status: 429, headers: { "Retry-After": String(RETRY_AFTER_SECONDS) } },
      );
    }
  } catch (error) {
    Sentry.captureException(error);
  }

  const rows = await getDatabase().sql`SELECT name FROM halaqahs WHERE teacher_invite_code = ${code}`;
  const row = rows[0];
  if (!row) {
    try {
      await recordFailedInviteAttempt(ip, ENDPOINT);
    } catch (error) {
      Sentry.captureException(error);
    }
    return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });
  }

  return Response.json({ halaqahName: row.name });
}
