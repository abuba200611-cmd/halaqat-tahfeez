import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { MAX_PHOTO_BYTES, MAX_PHOTOS_PER_MOSQUE, detectImageMime, parseVideoUrl } from "@/lib/mosque/archive";
import { addActivityPhoto, addActivityVideoLink, getActivity } from "@/lib/mosque/db";

type RouteContext = { params: Promise<{ id: string; activityId: string }> };

const TOO_LARGE = "الصورة أكبر من الحد المسموح (600 ك.ب) — تُضغط تلقائياً قبل الرفع";

/** يقرأ جسم الطلب مع سقف صارم — يتوقف ويرفض فور تجاوزه دون تخزين الباقي */
async function readCapped(request: Request, max: number): Promise<Uint8Array | "too-large"> {
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return "too-large";
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * إضافة وسيط لنشاط. صورة: جسم الطلب هو بايتات الصورة المضغوطة من المتصفح —
 * نتحقق من الحجم والبايتات السحرية لا من الترويسة. فيديو: JSON
 * {"videoUrl": "..."} برابط https من قائمة السماح، ولا يُرفع أي فيديو.
 */
export async function POST(request: Request, { params }: RouteContext) {
  const { id, activityId } = await params;
  if ([id, activityId].some((v) => parsePositiveIntParam(v) === null)) return paramNotFound();
  const mosqueId = Number(id);
  const gate = await featureGate(mosqueId, "archive");
  if (gate) return gate;

  const activity = await getActivity(mosqueId, Number(activityId));
  if (!activity) return Response.json({ error: "النشاط غير موجود" }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.startsWith("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { videoUrl?: unknown };
    const video = parseVideoUrl(body.videoUrl);
    if (!video) {
      return Response.json(
        { error: "رابط غير صالح — يجب أن يكون https من يوتيوب أو جوجل درايف أو إنستقرام أو تيك توك أو إكس" },
        { status: 400 },
      );
    }
    const created = await addActivityVideoLink(mosqueId, activity.id, video.url);
    if (!created) return Response.json({ error: "النشاط غير موجود" }, { status: 404 });
    return Response.json({ id: created.id }, { status: 201 });
  }

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES) {
    return Response.json({ error: TOO_LARGE }, { status: 413 });
  }
  const data = await readCapped(request, MAX_PHOTO_BYTES);
  if (data === "too-large") return Response.json({ error: TOO_LARGE }, { status: 413 });
  if (data.length === 0) return Response.json({ error: "لا توجد صورة في الطلب" }, { status: 400 });
  if (data.length > MAX_PHOTO_BYTES) return Response.json({ error: TOO_LARGE }, { status: 413 });
  const mime = detectImageMime(data);
  if (!mime) return Response.json({ error: "صيغة الصورة غير مدعومة — JPEG أو PNG أو WebP فقط" }, { status: 400 });

  const created = await addActivityPhoto(mosqueId, activity.id, mime, data);
  if (created === "full") {
    return Response.json(
      { error: `اكتمل الحد الأقصى لصور هذا الجامع (${MAX_PHOTOS_PER_MOSQUE} صورة) — احذف صوراً قديمة أولاً` },
      { status: 409 },
    );
  }
  if (!created) return Response.json({ error: "النشاط غير موجود" }, { status: 404 });
  return Response.json({ id: created.id }, { status: 201 });
}
