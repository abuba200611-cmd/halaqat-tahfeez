"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Empty } from "@/components/ui";
import { ParentInviteLink } from "@/components/parent-invite-link";
import { WardListItem } from "@/components/ward-list";
import { JuzProgressCard } from "@/components/juz-progress";
import { ReviewTrackCountsCard } from "@/components/review-track-bits";
import type { JuzProgress } from "@/lib/juz-progress";
import type { ReviewTrackCounts } from "@/lib/review-tracks";
import type { WardLog } from "@/lib/types";

type StudentDetail = {
  student: { id: string; name: string; group: string };
  progress: JuzProgress;
  trackCounts: { days7: ReviewTrackCounts; days30: ReviewTrackCounts };
  wards: WardLog[];
};

/**
 * B3 — صفحة طالب واحد عند المعلّم: تقدّم الأجزاء من تاريخ أوراده الكامل،
 * وعدّادات المراجعة لكل مسار، وآخر أوراده. الوصول محصور بالحلقة — الـAPI
 * يرجع 404 لأي طالب خارجها قبل كشف أي شيء.
 */
export default function TeacherStudentPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<StudentDetail | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/teacher/students/${encodeURIComponent(params.id)}`)
      .then((res): Promise<StudentDetail | "error"> => (res.ok ? res.json() : Promise.resolve("error")))
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail("error");
      });
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  if (detail === null) return <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>;
  if (detail === "error") {
    return <Empty title="لم نجد هذا الطالب في حلقتك." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold">{detail.student.name}</h1>
          <p className="text-xs text-muted-foreground">{detail.student.group}</p>
        </div>
        <Link href="/students" className="text-xs font-semibold text-accent-ink hover:underline">
          → كل الطلاب
        </Link>
      </div>

      <JuzProgressCard progress={detail.progress} />

      <ReviewTrackCountsCard days7={detail.trackCounts.days7} days30={detail.trackCounts.days30} />

      {/* دعوة ولي الأمر — نفس آلية رابط الدعوة بصفحة الطلاب (لا آلية جديدة) */}
      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold text-foreground">دعوة ولي الأمر</h2>
        <p className="text-xs text-muted-foreground">
          أنشئ رابط دعوة وأرسله لولي أمر {detail.student.name} عبر واتساب — يفتحه، ينشئ حسابه، ويدخل رمز الربط فيُربط بابنه تلقائياً.
        </p>
        <ParentInviteLink
          endpoint="/api/students/parent-link"
          studentId={detail.student.id}
          shareText={`دعوة لمتابعة ابنك ${detail.student.name} في حلقة التحفيظ:\n١) افتح الرابط أدناه\n٢) أنشئ حسابك كولي أمر\n٣) أدخل رمز الربط (مضمن في الرابط) ليُربط حسابك بابنك تلقائياً`}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-foreground">آخر الأوراد</h2>
        {detail.wards.length === 0 ? (
          <p className="rounded-2xl border border-border bg-surface p-4 text-sm text-muted-foreground">
            لا أوراد مسجّلة بعد.
          </p>
        ) : (
          <ul className="space-y-2">
            {detail.wards.map((log) => (
              <WardListItem key={log.id} log={log} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
