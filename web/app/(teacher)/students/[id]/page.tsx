"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, Empty } from "@/components/ui";
import { resetStore } from "@/lib/store";
import { ParentInviteLink } from "@/components/parent-invite-link";
import { WardListItem } from "@/components/ward-list";
import { JuzProgressCard } from "@/components/juz-progress";
import { ReviewTrackCountsCard } from "@/components/review-track-bits";
import type { JuzProgress } from "@/lib/juz-progress";
import type { ReviewTrackCounts } from "@/lib/review-tracks";
import { reviewTrackLabels, DEFAULT_REVIEW_TRACK_CONFIG, type ReviewTrackConfig } from "@/lib/review-track-config";
import type { WardLog } from "@/lib/types";

type StudentDetail = {
  student: { id: string; name: string; group: string };
  progress: JuzProgress;
  trackCounts: { days7: ReviewTrackCounts; days30: ReviewTrackCounts };
  reviewTrackConfig?: ReviewTrackConfig;
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
  // زر الحذف للمشرف فقط — الدور من الخادم (/api/teacher/settings)، لا افتراض بالواجهة
  const [isSupervisor, setIsSupervisor] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teacher/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { role?: "supervisor" | "assistant" } | null) => {
        if (!cancelled && data?.role) setIsSupervisor(data.role === "supervisor");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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

      {detail.reviewTrackConfig?.enabled !== false && (
        <ReviewTrackCountsCard
          days7={detail.trackCounts.days7}
          days30={detail.trackCounts.days30}
          labels={reviewTrackLabels((detail.reviewTrackConfig ?? DEFAULT_REVIEW_TRACK_CONFIG).naming)}
        />
      )}

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
              <WardListItem key={log.id} log={log} trackConfig={detail.reviewTrackConfig} />
            ))}
          </ul>
        )}
      </section>

      {isSupervisor && <DangerZone studentId={detail.student.id} name={detail.student.name} />}
    </div>
  );
}

/**
 * منطقة الخطر — حذف الطالب (للمشرف فقط). الحذف ناعم: يظهر شريط «استرجاع»
 * بصفحة الطلاب لمدة ٢٤ ساعة. نفس واجهة الـAPI السابقة (DELETE /api/students).
 */
function DangerZone({ studentId, name }: { studentId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/students", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: studentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "تعذّر الحذف");
        return;
      }
      resetStore(); // تُعاد قائمة الطلاب من الخادم عند فتح صفحة الطلاب
      router.push("/students");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="no-print space-y-2 rounded-2xl border border-destructive/40 bg-surface p-4">
      <h2 className="text-sm font-semibold text-destructive">منطقة الخطر</h2>
      <p className="text-xs text-muted-foreground">
        حذف {name} يخفيه من حلقتك. يمكنك التراجع واسترجاعه خلال ٢٤ ساعة من صفحة الطلاب.
      </p>
      <Button variant="danger" onClick={() => setOpen(true)}>
        حذف الطالب
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onKeyDown={(e) => {
            if (e.key === "Escape" && !busy) setOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-student-title"
            className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-5 shadow-xl"
          >
            <h3 id="delete-student-title" className="text-base font-semibold text-foreground">
              حذف {name}؟
            </h3>
            <p className="text-sm text-muted-foreground">
              سيُحذف الطالب من قائمتك ويمكن استرجاعه خلال ٢٤ ساعة فقط.
            </p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy} autoFocus>
                إلغاء
              </Button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={busy}
                className="cursor-pointer rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-destructive-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "جارٍ الحذف…" : "نعم، احذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
