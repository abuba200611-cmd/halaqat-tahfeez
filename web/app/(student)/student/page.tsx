"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IslamicPattern } from "@/app/(teacher)/page";
import { WardListItem } from "@/components/ward-list";
import { useStudentWards } from "@/components/use-student-wards";
import { useStudentSession } from "@/components/student-gate";
import { ParentInviteLink } from "@/components/parent-invite-link";
import { AttendanceSummaryCard } from "@/components/attendance-summary";
import type { AttendanceSummary } from "@/lib/attendance";
import { MonthlyPlanCard } from "@/components/monthly-plan-card";
import type { PlanView } from "@/lib/monthly-plan";
import { canEditWard } from "@/lib/ward-ayah";
import { riyadhTodayISO } from "@/lib/riyadh-date";
import { surahName, TOTAL_MUSHAF_PAGES } from "@/lib/quran-surahs";
import { computeStreak, hifzPagesCovered, latestHifzProgress, STATUS_LABEL } from "@/lib/student-ward-display";
import type { BuddyRequest } from "@/lib/types";

const MOTIVATIONS = [
  "كل صفحة تحفظها اليوم خطوة أقرب لختم القرآن.",
  "المراجعة اليوم تثبّت حفظ الأمس — استمر.",
  "«خيركم من تعلّم القرآن وعلّمه» — واصل وردك.",
];

/** يختار عبارة تحفيزية ثابتة ليوم واحد (لا تتغيّر عند كل إعادة عرض) — بذرة من تاريخ اليوم نفسه */
function motivationForToday(): string {
  const day = Number(riyadhTodayISO().replaceAll("-", ""));
  return MOTIVATIONS[day % MOTIVATIONS.length];
}

/** هل إشعارات المتصفّح مفعّلة فعلياً على هذا الجهاز؟ فحص فقط، بلا أي زرّ (الزرّ الكامل بصفحة الإعدادات) */
function useReminderEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setEnabled(false);
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (!cancelled) setEnabled(!!sub);
      } catch {
        if (!cancelled) setEnabled(false);
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, []);
  return enabled;
}

/**
 * بطاقة "فلان قال إنه راجع معك" — تأكيد خفيف لطلب واحد محدَّد، لا علاقة
 * مستمرة (STEP 56). لا تكشف أي شيء من ورد الطالب الآخر غير الاسم
 * والتاريخ (نفس ما يرجعه /api/wards/buddy-requests بالضبط).
 */
function BuddyRequestsCard() {
  const [requests, setRequests] = useState<BuddyRequest[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    fetch("/api/wards/buddy-requests")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { requests?: BuddyRequest[] } | null) => setRequests(data?.requests ?? []))
      .catch(() => {});
  };

  useEffect(load, []);

  async function respond(wardLogId: number, action: "confirm" | "decline") {
    setBusyId(wardLogId);
    try {
      await fetch("/api/wards/buddy-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wardLogId, action }),
      });
      setRequests((prev) => prev.filter((r) => r.wardLogId !== wardLogId));
    } catch {
      load();
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) return null;

  return (
    <div className="space-y-2">
      {requests.map((r) => (
        <div key={r.wardLogId} className="rounded-2xl border border-accent/60 bg-accent-soft px-4 py-3">
          <p className="text-sm text-foreground">
            🤝 <span className="font-semibold">{r.requesterName}</span> قال إنه راجع معك يوم {r.date}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busyId === r.wardLogId}
              onClick={() => respond(r.wardLogId, "confirm")}
              className="cursor-pointer rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-on-secondary hover:bg-secondary-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              تأكيد
            </button>
            <button
              type="button"
              disabled={busyId === r.wardLogId}
              onClick={() => respond(r.wardLogId, "decline")}
              className="cursor-pointer rounded-lg border border-accent/60 bg-white px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              تجاهل
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** حضور الطالب نفسه (آخر ٣٠ يوماً) — صامتة عند أي فشل، لا تؤثر على بقية اللوحة */
function useMyAttendance(): AttendanceSummary | null {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/student/attendance")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { summary?: AttendanceSummary | null } | null) => {
        if (!cancelled) setSummary(data?.summary ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return summary;
}

/** خطة الطالب لهذا الشهر الهجري — صامتة عند أي فشل، لا تؤثر على بقية اللوحة */
function useMyPlan(): PlanView | null {
  const [plan, setPlan] = useState<PlanView | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/student/plan")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { plan?: PlanView | null } | null) => {
        if (!cancelled) setPlan(data?.plan ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return plan;
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const student = useStudentSession();
  const { logs, loadingLogs, months, loadingMonths } = useStudentWards();
  const reminderEnabled = useReminderEnabled();
  const attendance = useMyAttendance();
  const monthlyPlan = useMyPlan();

  const today = riyadhTodayISO();
  const thisMonthKey = today.slice(0, 7);
  const thisMonth = months.find((m) => m.key === thisMonthKey) ?? null;

  const streak = useMemo(() => computeStreak(logs.map((l) => l.date), today), [logs, today]);
  const loggedToday = logs.some((l) => l.date === today);
  const lastLog = logs[0] ?? null;
  const pagesCovered = useMemo(() => hifzPagesCovered(logs), [logs]);
  const lastHifz = useMemo(() => latestHifzProgress(logs), [logs]);
  const editableLastLogs = logs.slice(0, 5);

  const loading = loadingLogs || loadingMonths;
  const isNewStudent = !loading && logs.length === 0;

  return (
    <div className="space-y-5">
      <div
        className="relative overflow-hidden rounded-2xl p-5 text-white"
        style={{ background: "linear-gradient(135deg, #000000, #241B12)" }}
      >
        <IslamicPattern />
        <div className="relative">
          <h1 className="font-display text-xl font-bold">
            {student ? `السلام عليكم يا ${student.name}` : "أهلاً بك"}
          </h1>
          <p className="mt-1 text-xs text-white/80">{motivationForToday()}</p>
        </div>
      </div>

      <BuddyRequestsCard />

      {isNewStudent ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
          <p className="mb-1 text-2xl">📖</p>
          <p className="mb-1 font-naskh text-lg font-bold text-stone-800">لم ترسل أي ورد بعد</p>
          <p className="mb-4 text-sm text-stone-500">سجّل حفظك ومراجعتك الأولى، ويصل معلّمك مباشرة أنك بدأت.</p>
          <Link
            href="/student/log"
            className="inline-block cursor-pointer rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm"
            style={{ background: "linear-gradient(90deg, #241B12, #000000)" }}
          >
            سجّل أول وردي
          </Link>
        </div>
      ) : (
        <>
          {!loading && !loggedToday && (
            <div className="rounded-2xl border border-accent/60 bg-accent-soft px-4 py-3 text-sm text-accent-ink">
              📖 ما سجّلت وردك اليوم بعد —{" "}
              <Link href="/student/log" className="font-semibold underline hover:no-underline">
                سجّله الآن
              </Link>
            </div>
          )}

          {reminderEnabled === false && (
            <Link
              href="/student/settings"
              className="block rounded-2xl border border-accent/60 bg-accent-soft px-4 py-3 text-sm font-semibold text-accent-ink hover:bg-accent/25"
            >
              🔔 فعّل التذكير اليومي حتى لا يفوتك ورد
            </Link>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-stone-200 bg-white p-3.5 text-center">
              <div className="tabular text-xl font-bold text-success">{thisMonth?.hifzPages ?? 0}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">صفحات حفظ هذا الشهر</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-3.5 text-center">
              <div className="tabular text-xl font-bold text-accent-ink">{thisMonth?.reviewPages ?? 0}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">صفحات مراجعة هذا الشهر</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-3.5 text-center">
              <div className="tabular text-xl font-bold text-accent-ink">{streak}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">أيام متتالية</div>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-3.5 text-center">
              <div className="text-sm font-bold text-stone-800">{lastLog ? STATUS_LABEL[lastLog.status] : "—"}</div>
              <div className="mt-0.5 text-[11px] text-stone-500">حالة آخر ورد</div>
            </div>
          </div>

          {pagesCovered > 0 && (
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="mb-1.5 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-stone-700">تقدّم الحفظ</h2>
                <span className="tabular text-xs text-stone-500">
                  {pagesCovered} من {TOTAL_MUSHAF_PAGES} صفحة
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (pagesCovered / TOTAL_MUSHAF_PAGES) * 100)}%`,
                    background: "linear-gradient(90deg, #AD7D56, #8A6242)",
                  }}
                />
              </div>
              {lastHifz && (
                <p className="mt-1.5 text-xs text-stone-500">
                  آخر ما وصلت: سورة {surahName(lastHifz.surah)} (صفحة {lastHifz.page})
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/student/log"
              className="cursor-pointer rounded-xl px-3 py-3 text-center text-sm font-bold text-white shadow-sm transition-shadow duration-200 hover:shadow-lg sm:col-span-1"
              style={{ background: "linear-gradient(90deg, #241B12, #000000)" }}
            >
              سجّل وردي اليوم
            </Link>
            <Link
              href="/student/monthly"
              className="cursor-pointer rounded-xl border border-stone-200 bg-white px-3 py-3 text-center text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              التقرير الشهري
            </Link>
            <Link
              href="/student/suggest"
              className="cursor-pointer rounded-xl border border-stone-200 bg-white px-3 py-3 text-center text-sm font-semibold text-stone-700 hover:bg-stone-50"
            >
              اقتراح أو بلاغ
            </Link>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-700">آخر أوراد</h2>
              <Link href="/student/wards" className="text-xs font-semibold text-accent-ink hover:underline">
                كل أورادي
              </Link>
            </div>
            <ul className="space-y-2">
              {editableLastLogs.map((log) => (
                <WardListItem
                  key={log.id}
                  log={log}
                  onEdit={canEditWard(log.status) ? () => router.push(`/student/log?edit=${log.id}`) : undefined}
                />
              ))}
            </ul>
          </section>
        </>
      )}

      <MonthlyPlanCard view={monthlyPlan} />

      <AttendanceSummaryCard summary={attendance} />

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-stone-700">👪 شارك مع ولي أمرك</h2>
        <p className="mb-2 text-xs text-stone-500">أنشئ رابطاً يفتحه ولي أمرك ليتابع تقدّمك (قراءة فقط).</p>
        <ParentInviteLink
          endpoint="/api/student/parent-link"
          shareText="رابط متابعة حفظي في الحلقة:"
        />
      </div>
    </div>
  );
}
