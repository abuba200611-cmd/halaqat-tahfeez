import { currentTeacher, unauthorized } from "@/lib/auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { errorGradingContextForHalaqah, saveWardErrorGrade } from "@/lib/error-grading-db";
import { gradeWard } from "@/lib/error-grading";
import { logServerError } from "@/lib/dev-error-log";

/*
  تقييم الورد بنقاط الأخطاء (ميزة error_grading). الحلقة من جلسة المعلّم فقط.
  الميزة معطّلة أو الحلقة غير مربوطة بجامع = { enabled:false } فتبقى واجهة
  الاعتماد/الإعادة القائمة كما هي. الدرجة والتقدير يُحسبان هنا من العدّادات
  حصراً — لا يقبل المسار درجة جاهزة من العميل.
*/

/** هل الميزة مفعّلة لجامع حلقتي؟ وإن كانت فالإعدادات الفعّالة لبناء العدّادات */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const ctx = await errorGradingContextForHalaqah(teacher.halaqahId);
  return Response.json(ctx ? { enabled: true, config: ctx.config } : { enabled: false });
}

/** يحفظ تقييم ورد واحد: { id, counts: {مفتاح النوع: العدد} } */
export async function PUT(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (!(await checkRateLimit(`ward-grade:${teacher.id}`, 600, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { id?: unknown; counts?: unknown };
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return Response.json({ error: "معرّف الورد مفقود" }, { status: 400 });

  try {
    const ctx = await errorGradingContextForHalaqah(teacher.halaqahId);
    if (!ctx) return Response.json({ error: "تقييم النقاط غير مفعّل" }, { status: 404 });

    const graded = gradeWard(ctx.config, body.counts);
    if (!graded.ok) return Response.json({ error: graded.error }, { status: 400 });

    const saved = await saveWardErrorGrade(
      teacher.halaqahId,
      id,
      graded.value.counts,
      graded.value.score,
      graded.value.band,
    );
    if (!saved) return Response.json({ error: "الورد غير موجود" }, { status: 404 });

    return Response.json({ ok: true, score: graded.value.score, band: graded.value.band, counts: graded.value.counts });
  } catch (error) {
    await logServerError("wards-grade:put", error);
    throw error;
  }
}
