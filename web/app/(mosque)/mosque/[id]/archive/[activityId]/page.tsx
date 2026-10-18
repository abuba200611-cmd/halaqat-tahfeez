"use client";

import { useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import { compressImage } from "@/components/mosque/image-compress";
import { Lightbox } from "@/components/mosque/lightbox";
import { VIDEO_HOST_LABEL, parseVideoUrl, youtubeId } from "@/lib/mosque/archive";
import type { Activity, ActivityMedia } from "@/lib/mosque/db";

const TAG_LABEL = { halaqah: "حلقة", family: "أسرة", committee: "لجنة" } as const;

/** نشاط واحد: معرض صور بعارض، إضافة صور (ضغط بالمتصفح) وروابط فيديو، وحذف */
export default function ActivityPage() {
  const params = useParams<{ id: string; activityId: string }>();
  const mosqueId = Number(params.id);
  const activityId = Number(params.activityId);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/archive/${activityId}`} title="نشاط">
      <ActivityDetail mosqueId={mosqueId} activityId={activityId} />
    </MosquePage>
  );
}

function ActivityDetail({ mosqueId, activityId }: { mosqueId: number; activityId: number }) {
  const router = useRouter();
  const base = `/api/mosques/${mosqueId}/archive/${activityId}`;
  const { data, status, loading, reload } = useApi<{ activity: Activity; media: ActivityMedia[] }>(base);
  const fileInput = useRef<HTMLInputElement>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  if (!data) {
    return status === 404 ? (
      <Empty
        title="النشاط غير موجود أو الميزة غير مفعّلة."
        action={
          <Link href={`/mosque/${mosqueId}/archive`} className="text-sm text-accent-ink hover:underline">
            العودة للأرشيف
          </Link>
        }
      />
    ) : (
      <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="أرشيف الأنشطة" />
    );
  }

  const { activity, media } = data;
  const photos = media.filter((m) => m.kind === "photo");
  const videos = media.filter((m) => m.kind === "video_link");
  const photoUrl = (mediaId: number) => `${base}/media/${mediaId}`;
  const lightboxItems = photos.map((p) => ({ src: photoUrl(p.id), alt: activity.title }));

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    setError(null);
    setProblems([]);
    const failed: string[] = [];
    setProgress({ done: 0, total: files.length });
    for (const [index, file] of files.entries()) {
      try {
        const blob = await compressImage(file);
        const res = await fetch(`${base}/media`, {
          method: "POST",
          headers: { "Content-Type": blob.type },
          body: blob,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          failed.push(`${file.name}: ${body?.error ?? "تعذّر الرفع"}`);
          if (res.status === 409) break; // اكتمل حد الجامع — لا فائدة من المتابعة
        }
      } catch (err) {
        failed.push(`${file.name}: ${err instanceof Error ? err.message : "تعذّر الرفع"}`);
      }
      setProgress({ done: index + 1, total: files.length });
    }
    setProgress(null);
    setProblems(failed);
    if (fileInput.current) fileInput.current.value = "";
    reload();
  }

  async function addVideo(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!parseVideoUrl(videoUrl)) {
      setError("رابط غير صالح — يجب أن يكون https من يوتيوب أو جوجل درايف أو إنستقرام أو تيك توك أو إكس");
      return;
    }
    const result = await callApi(`${base}/media`, "POST", { videoUrl });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setVideoUrl("");
    reload();
  }

  async function removeMedia(item: ActivityMedia) {
    const label = item.kind === "photo" ? "هذه الصورة" : "رابط الفيديو";
    if (!window.confirm(`حذف ${label}؟ لا يمكن التراجع.`)) return;
    const result = await callApi(`${base}/media/${item.id}`, "DELETE");
    if (!result.ok) setError(result.error);
    reload();
  }

  async function removeActivity() {
    if (!window.confirm(`حذف النشاط «${activity.title}» مع كل صوره وروابطه؟ لا يمكن التراجع.`)) return;
    const result = await callApi(base, "DELETE");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/mosque/${mosqueId}/archive`);
  }

  const uploading = progress !== null;

  return (
    <div className="space-y-5">
      <Link href={`/mosque/${mosqueId}/archive`} className="text-sm text-accent-ink hover:underline">
        ← كل الأنشطة
      </Link>

      <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold">{activity.title}</h2>
          <p className="tabular mt-1 text-sm text-muted-foreground">{activity.activityDate}</p>
          {activity.tagKind && activity.tagName && (
            <div className="mt-2">
              <Badge tone="good">
                {TAG_LABEL[activity.tagKind]}: {activity.tagName}
              </Badge>
            </div>
          )}
          {activity.description && <p className="mt-2 whitespace-pre-wrap text-sm">{activity.description}</p>}
        </div>
        <Button variant="danger" onClick={removeActivity}>
          حذف النشاط
        </Button>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">الصور</h3>
            <Badge tone="good">{photos.length}</Badge>
          </div>
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              onChange={(e) => uploadFiles([...(e.target.files ?? [])])}
              className="sr-only"
              id="photo-input"
            />
            <label
              htmlFor="photo-input"
              className={`inline-block cursor-pointer rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-on-primary transition-colors duration-200 hover:bg-primary-hover ${
                uploading ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {uploading ? `جارٍ الرفع ${progress.done}/${progress.total}…` : "إضافة صور"}
            </label>
          </div>
        </div>

        {uploading && (
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        )}
        {problems.length > 0 && (
          <ul className="space-y-1 text-sm text-destructive">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        )}

        {photos.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا صور بعد. تُضغط الصور تلقائياً في متصفحك قبل الرفع.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {photos.map((photo, index) => (
              <div key={photo.id} className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
                <button
                  type="button"
                  onClick={() => setLightbox(index)}
                  aria-label={`عرض الصورة ${index + 1}`}
                  className="h-full w-full cursor-pointer"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoUrl(photo.id)} alt={activity.title} loading="lazy" className="h-full w-full object-cover" />
                </button>
                <button
                  type="button"
                  onClick={() => removeMedia(photo)}
                  aria-label="حذف الصورة"
                  className="absolute top-1.5 end-1.5 cursor-pointer rounded-full bg-black/60 px-2 py-0.5 text-xs text-white hover:bg-black/80"
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">الفيديو</h3>
          <Badge tone="good">{videos.length}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          لا نرفع الفيديو هنا — ضع رابطه من يوتيوب أو جوجل درايف أو إنستقرام أو تيك توك أو إكس.
        </p>

        <form onSubmit={addVideo} className="flex flex-wrap gap-2">
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            type="url"
            dir="ltr"
            maxLength={500}
            placeholder="https://www.youtube.com/watch?v=..."
            aria-label="رابط الفيديو"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <Button type="submit" disabled={!videoUrl.trim()}>
            إضافة رابط
          </Button>
        </form>

        {videos.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {videos.map((video) => {
              const parsed = video.url ? parseVideoUrl(video.url) : null;
              if (!parsed) return null;
              const ytId = parsed.host === "youtube" ? youtubeId(parsed.url) : null;
              return (
                <div key={video.id} className="space-y-2 rounded-xl border border-border p-2">
                  {ytId ? (
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${ytId}`}
                      title={activity.title}
                      loading="lazy"
                      allow="encrypted-media; picture-in-picture; fullscreen"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                      className="aspect-video w-full rounded-lg"
                    />
                  ) : (
                    <a
                      href={parsed.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex aspect-video w-full flex-col items-center justify-center gap-1 rounded-lg bg-muted text-sm text-accent-ink hover:underline"
                    >
                      <span className="font-medium">{VIDEO_HOST_LABEL[parsed.host]}</span>
                      <span className="text-xs text-muted-foreground">فتح الفيديو في نافذة جديدة</span>
                    </a>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-xs text-muted-foreground" dir="ltr">
                      {new URL(parsed.url).hostname}
                    </span>
                    <Button variant="danger" onClick={() => removeMedia(video)}>
                      حذف
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Lightbox
        items={lightboxItems}
        index={lightbox}
        onChange={setLightbox}
        onClose={() => setLightbox(null)}
      />
    </div>
  );
}
