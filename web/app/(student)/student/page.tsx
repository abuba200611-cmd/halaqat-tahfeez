"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { IslamicPattern } from "@/app/(teacher)/page";
import { WardListItem } from "@/components/ward-list";
import { useStudentWards } from "@/components/use-student-wards";
import { useStudentSession } from "@/components/student-gate";
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
        <div key={r.wardLogId} className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-sm text-blue-900">
            🤝 <span className="font-semibold">{r.requesterName}</span> قال إنه راجع معك يوم {r.date}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={busyId === r.wardLogId}
              onClick={() => respond(r.wardLogId, "confirm")}
              className="cursor-pointer rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              تأكيد
            </button>
            <button
              type="button"
              disabled={busyId === r.wardLogId}
              onClick={() => respond(r.wardLogId, "decline")}
              className="cursor-pointer rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              تجاهل
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function StudentDashboardPage() {
  const router = useRouter();
  const student = useStudentSession();
  const { logs, loadingLogs, months, loadingMonths } = useStudentWards();
  const reminderEnabled = useReminderEnabled();

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
        style={{ background: "linear-gradient(135deg, #1E3A8A, #2563EB)" }}
      >
        <IslamicPattern />
        <div className="relative">
          <h1 className="font-naskh text-xl font-bold">
            {student ? `السلام عليكم يا ${student.name}` : "أهلاً بك"}
          </h1>
          <p className="mt-1 text-xs text-white/80">{motivationForToday()}</p>
        </div>
      </div>

      <BuddyRequestsCard />

      {isNewStudent ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <p className="mb-1 text-2xl">📖</p>
          <p className="mb-1 font-naskh text-lg font-bold text-slate-800">لم ترسل أي ورد بعد</p>
          <p className="mb-4 text-sm text-slate-500">سجّل حفظك ومراجعتك الأولى، ويصل معلّمك مباشرة أنك بدأت.</p>
          <Link
            href="/student/log"
            className="inline-block cursor-pointer rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm"
            style={{ background: "linear-gradient(90deg, #3B82F6, #1D4ED8)" }}
          >
            سجّل أول وردي
          </Link>
        </div>
      ) : (
        <>
          {!loading && !loggedToday && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              📖 ما سجّلت وردك اليوم بعد —{" "}
              <Link href="/student/log" className="font-semibold underline hover:no-underline">
                سجّله الآن
              </Link>
            </div>
          )}

          {reminderEnabled === false && (
            <Link
              href="/student/settings"
              className="block rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"
            >
              🔔 فعّل التذكير اليومي حتى لا يفوتك ورد
            </Link>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
              <div className="tabular text-xl font-bold text-emerald-700">{thisMonth?.hifzPages ?? 0}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">صفحات حفظ هذا الشهر</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
              <div className="tabular text-xl font-bold text-blue-700">{thisMonth?.reviewPages ?? 0}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">صفحات مراجعة هذا الشهر</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
              <div className="tabular text-xl font-bold text-orange-600">{streak}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">أيام متتالية</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
              <div className="text-sm font-bold text-slate-800">{lastLog ? STATUS_LABEL[lastLog.status] : "—"}</div>
              <div className="mt-0.5 text-[11px] text-slate-500">حالة آخر ورد</div>
            </div>
          </div>

          {pagesCovered > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-1.5 flex items-baseline justify-between">
                <h2 className="text-sm font-semibold text-slate-700">تقدّم الحفظ</h2>
                <span className="tabular text-xs text-slate-500">
                  {pagesCovered} من {TOTAL_MUSHAF_PAGES} صفحة
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, (pagesCovered / TOTAL_MUSHAF_PAGES) * 100)}%`,
                    background: "linear-gradient(90deg, #10B981, #059669)",
                  }}
                />
              </div>
              {lastHifz && (
                <p className="mt-1.5 text-xs text-slate-500">
                  آخر ما وصلت: سورة {surahName(lastHifz.surah)} (صفحة {lastHifz.page})
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <Link
              href="/student/log"
              className="cursor-pointer rounded-xl px-3 py-3 text-center text-sm font-bold text-white shadow-sm transition-shadow duration-200 hover:shadow-lg sm:col-span-1"
              style={{ background: "linear-gradient(90deg, #3B82F6, #1D4ED8)" }}
            >
              سجّل وردي اليوم
            </Link>
            <Link
              href="/student/monthly"
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              التقرير الشهري
            </Link>
            <Link
              href="/student/suggest"
              className="cursor-pointer rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              اقتراح أو بلاغ
            </Link>
          </div>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">آخر أوراد</h2>
              <Link href="/student/wards" className="text-xs font-semibold text-blue-600 hover:underline">
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
    </div>
  );
}
