"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { Activity } from "@/lib/mosque/db";
import type { TagKind } from "@/lib/mosque/archive";

type TagOption = { id: number; name: string };
type ListResponse = { activities: Activity[]; tagOptions: Record<TagKind, TagOption[]> };

const TAG_LABEL: Record<TagKind, string> = { halaqah: "حلقة", family: "أسرة", committee: "لجنة" };
const TAG_KINDS: TagKind[] = ["halaqah", "family", "committee"];

function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** أرشيف الأنشطة: شبكة أنشطة بغلاف وتاريخ ووسم، مع فلترة بالوسم والسنة وإنشاء نشاط */
export default function ArchivePage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/archive`} title="أرشيف الأنشطة">
      <ArchiveList mosqueId={mosqueId} />
    </MosquePage>
  );
}

function ArchiveList({ mosqueId }: { mosqueId: number }) {
  const router = useRouter();
  const { data, status, loading } = useApi<ListResponse>(`/api/mosques/${mosqueId}/archive`);
  const [tagFilter, setTagFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  const [title, setTitle] = useState("");
  const [activityDate, setActivityDate] = useState(today);
  const [description, setDescription] = useState("");
  const [tag, setTag] = useState(""); // "kind:id" أو فارغ
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(
    () => [...new Set((data?.activities ?? []).map((a) => a.activityDate.slice(0, 4)))].sort().reverse(),
    [data],
  );
  const visible = useMemo(
    () =>
      (data?.activities ?? []).filter((a) => {
        if (yearFilter !== "all" && !a.activityDate.startsWith(yearFilter)) return false;
        if (tagFilter === "all") return true;
        if (tagFilter === "none") return a.tagKind === null;
        return `${a.tagKind}:${a.tagId}` === tagFilter;
      }),
    [data, tagFilter, yearFilter],
  );

  if (!data) return <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="أرشيف الأنشطة" />;

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const [tagKind, tagId] = tag ? tag.split(":") : [undefined, undefined];
    const result = await callApi<{ id: number }>(`/api/mosques/${mosqueId}/archive`, "POST", {
      title,
      description,
      activityDate,
      tagKind,
      tagId: tagId ? Number(tagId) : undefined,
    });
    setBusy(false);
    if (!result.ok || !result.data) {
      setError(result.error);
      return;
    }
    router.push(`/mosque/${mosqueId}/archive/${result.data.id}`);
  }

  const tagGroups = TAG_KINDS.filter((kind) => data.tagOptions[kind].length > 0);

  return (
    <div className="space-y-5">
      <Card className="p-4">
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="block text-xs text-muted-foreground">
              عنوان النشاط
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                required
                placeholder="مثال: حفل ختم الجزء الثلاثين"
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block text-xs text-muted-foreground">
              التاريخ
              <input
                type="date"
                value={activityDate}
                onChange={(e) => setActivityDate(e.target.value)}
                required
                className={`${inputClass} mt-1`}
              />
            </label>
          </div>
          <label className="block text-xs text-muted-foreground">
            وصف (اختياري)
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={2}
              className={`${inputClass} mt-1`}
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            {tagGroups.length > 0 && (
              <label className="block text-xs text-muted-foreground">
                وسم (اختياري)
                <select value={tag} onChange={(e) => setTag(e.target.value)} className={`${inputClass} mt-1`}>
                  <option value="">بدون وسم</option>
                  {tagGroups.map((kind) => (
                    <optgroup key={kind} label={TAG_LABEL[kind]}>
                      {data.tagOptions[kind].map((option) => (
                        <option key={option.id} value={`${kind}:${option.id}`}>
                          {option.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <Button type="submit" disabled={busy || !title.trim() || !activityDate}>
              إنشاء نشاط
            </Button>
          </div>
        </form>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>

      {data.activities.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            aria-label="فلترة بالوسم"
            className={`${inputClass} !w-auto`}
          >
            <option value="all">كل الوسوم</option>
            <option value="none">بدون وسم</option>
            {tagGroups.map((kind) => (
              <optgroup key={kind} label={TAG_LABEL[kind]}>
                {data.tagOptions[kind].map((option) => (
                  <option key={option.id} value={`${kind}:${option.id}`}>
                    {option.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            aria-label="فلترة بالسنة"
            className={`${inputClass} !w-auto`}
          >
            <option value="all">كل السنوات</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
      )}

      {data.activities.length === 0 ? (
        <Empty title="لا أنشطة بعد — أنشئ أول نشاط من النموذج أعلاه ثم أضف صوره." />
      ) : visible.length === 0 ? (
        <Empty title="لا أنشطة تطابق الفلترة." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((activity) => (
            <Link key={activity.id} href={`/mosque/${mosqueId}/archive/${activity.id}`}>
              <Card className="overflow-hidden transition-colors duration-200 hover:border-border-strong">
                <div className="flex aspect-[4/3] items-center justify-center bg-muted text-xs text-muted-foreground">
                  {activity.coverMediaId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/mosques/${mosqueId}/archive/${activity.id}/media/${activity.coverMediaId}`}
                      alt={activity.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    "بلا صور"
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="font-semibold">{activity.title}</p>
                  <p className="tabular text-xs text-muted-foreground">{activity.activityDate}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {activity.tagKind && activity.tagName && (
                      <Badge>
                        {TAG_LABEL[activity.tagKind]}: {activity.tagName}
                      </Badge>
                    )}
                    {activity.photoCount > 0 && <Badge>{activity.photoCount} صورة</Badge>}
                    {activity.videoCount > 0 && <Badge>{activity.videoCount} فيديو</Badge>}
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
