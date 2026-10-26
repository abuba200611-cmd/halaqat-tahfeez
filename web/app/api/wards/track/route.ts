import { currentTeacher, unauthorized } from "@/lib/auth";
import { setWardReviewTracks } from "@/lib/db";
import { parseReviewTracks } from "@/lib/review-tracks";
import { logServerError } from "@/lib/dev-error-log";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/**
 * B3 — المعلّم يعيد تصنيف مقاطع مراجعة ورد قائم (الكبرى/الصغرى) قبل قراره.
 * مصفوفة كاملة بعدد مقاطع الورد نفسه (null = مقطع بلا تصنيف). الورد
 * المقفول (approved/needs_revision) لا يُعاد تصنيفه — الاعتماد يثبّت
 * المحتوى، وورد حلقة أخرى 404 متطابقاً مع غير الموجود.
 */
export async function PATCH(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  if (!(await checkRateLimit(`ward-track:${teacher.id}`, 120, 3600))) {
    return rateLimited();
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id)) return Response.json({ error: "معرّف الورد مفقود" }, { status: 400 });

    // عدد المقاطع يُقرأ من قاعدة البيانات داخل setWardReviewTracks؛ هنا
    // نتحقّق من الصيغة فقط (قيم مسموحة وبلا فائض على ١٠ مقاطع كحد أقصى)
    const raw = Array.isArray(body.tracks) ? body.tracks : null;
    const tracks = parseReviewTracks(raw, raw?.length ?? 0);
    if (!tracks) return Response.json({ error: "قائمة التصنيفات مطلوبة" }, { status: 400 });

    const result = await setWardReviewTracks(teacher.halaqahId, id, tracks);
    if (result === "not_found") return Response.json({ error: "الورد غير موجود" }, { status: 404 });
    if (result === "locked") {
      return Response.json({ error: "لا يمكن تصنيف ورد اكتمل قراره" }, { status: 403 });
    }
    if (result === "count_mismatch") {
      return Response.json({ error: "عدد التصنيفات لازم يطابق عدد مقاطع المراجعة" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    await logServerError("wards/track:patch", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر حفظ التصنيف" },
      { status: 400 },
    );
  }
}
