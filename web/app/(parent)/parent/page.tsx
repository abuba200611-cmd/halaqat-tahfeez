"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useParentSession } from "@/components/parent-shell";
import { ParentPushToggle } from "@/components/parent-push-toggle";
import { AttendanceSummaryCard } from "@/components/attendance-summary";
import type { AttendanceSummary } from "@/lib/attendance";
import { MonthlyPlanCard } from "@/components/monthly-plan-card";
import { RecitationCard } from "@/components/recitation-card";
import type { RecitationView } from "@/lib/recitations";
import type { PlanView } from "@/lib/monthly-plan";
import type { ParentChildSummary } from "@/lib/parent-summary";
import { STATUS_LABEL, statusTone } from "@/lib/student-ward-display";

type Child = { halaqahId: number; studentId: string; studentName: string; halaqahName: string };
type ChildDetail = {
  child: { name: string; halaqahName: string };
  summary: ParentChildSummary;
};

const keyOf = (c: { halaqahId: number; studentId: string }) => `${c.halaqahId}:${c.studentId}`;

export default function ParentDashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

function Dashboard() {
  const { parent, checking } = useParentSession();
  const router = useRouter();
  const params = useSearchParams();
  const parentId = parent?.id ?? null;

  const [children, setChildren] = useState<Child[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    if (parentId === null) return;
    let cancelled = false;
    fetch("/api/parent/children")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { children?: Child[] } | null) => {
        if (!cancelled) setChildren(data?.children ?? []);
      })
      .catch(() => {
        if (!cancelled) setChildren([]);
      });
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  if (checking) return <p className="text-sm text-slate-500">جارٍ التحقق…</p>;

  if (!parent) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="mb-3 text-sm text-slate-600">سجّل دخولك لمتابعة أبنائك.</p>
        <Link
          href="/parent/login"
          className="inline-block rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
        >
          تسجيل الدخول
        </Link>
      </div>
    );
  }

  if (children === null) return <p className="text-sm text-slate-500">جارٍ التحميل…</p>;

  if (children.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="mb-1 text-2xl">👪</p>
        <p className="mb-1 font-naskh text-lg font-bold text-slate-800">لا أبناء مرتبطون بعد</p>
        <p className="text-sm text-slate-500">
          اطلب رابط الدعوة من معلّم الحلقة أو من ابنك (من لوحته ← «شارك مع ولي أمرك»)، ثم افتحه من هذا الجهاز.
        </p>
      </div>
    );
  }

  const fromUrl = `${params.get("halaqah")}:${params.get("student")}`;
  const activeKey =
    selected && children.some((c) => keyOf(c) === selected)
      ? selected
      : children.some((c) => keyOf(c) === fromUrl)
        ? fromUrl
        : keyOf(children[0]);
  const active = children.find((c) => keyOf(c) === activeKey)!;

  return (
    <div className="space-y-5">
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="الأبناء">
          {children.map((c) => (
            <button
              key={keyOf(c)}
              type="button"
              role="tab"
              aria-selected={keyOf(c) === activeKey}
              onClick={() => {
                setSelected(keyOf(c));
                router.replace("/parent");
              }}
              className={`cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold ${
                keyOf(c) === activeKey
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {c.studentName}
            </button>
          ))}
        </div>
      )}

      <ChildPanel key={activeKey} child={active} />

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">الإشعارات</h2>
        <ParentPushToggle />
      </div>
    </div>
  );
}

/** حضور الابن (آخر ٣٠ يوماً) — صامتة عند الفشل ولا تعطّل بقية اللوحة */
function useChildAttendance(child: Child): AttendanceSummary | null {
  const [summary, setSummary] = useState<AttendanceSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/parent/attendance?halaqah=${child.halaqahId}&student=${encodeURIComponent(child.studentId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { summary?: AttendanceSummary | null } | null) => {
        if (!cancelled) setSummary(data?.summary ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [child.halaqahId, child.studentId]);
  return summary;
}

/** خطة الابن لهذا الشهر الهجري — صامتة عند الفشل ولا تعطّل بقية اللوحة */
function useChildPlan(child: Child): PlanView | null {
  const [plan, setPlan] = useState<PlanView | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/parent/plan?halaqahId=${child.halaqahId}&studentId=${encodeURIComponent(child.studentId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { plan?: PlanView | null } | null) => {
        if (!cancelled) setPlan(data?.plan ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [child.halaqahId, child.studentId]);
  return plan;
}

/** آخر تلاوات الابن — صامتة عند الفشل ولا تعطّل بقية اللوحة */
function useChildRecitations(child: Child): RecitationView[] {
  const [items, setItems] = useState<RecitationView[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/parent/recitations?halaqah=${child.halaqahId}&student=${encodeURIComponent(child.studentId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { recitations?: RecitationView[] } | null) => {
        if (!cancelled) setItems(data?.recitations ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [child.halaqahId, child.studentId]);
  return items;
}

function ChildPanel({ child }: { child: Child }) {
  // null = لم يُجلب بعد، "error" = تعذّر، وإلا البيانات
  const [detail, setDetail] = useState<ChildDetail | "error" | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/parent/child?halaqah=${child.halaqahId}&student=${encodeURIComponent(child.studentId)}`)
      .then((res): Promise<ChildDetail | "error"> => (res.ok ? res.json() : Promise.resolve("error")))
      .then((data) => {
        if (!cancelled) setDetail(data);
      })
      .catch(() => {
        if (!cancelled) setDetail("error");
      });
    return () => {
      cancelled = true;
    };
  }, [child.halaqahId, child.studentId]);

  const attendance = useChildAttendance(child);
  const monthlyPlan = useChildPlan(child);
  const recitations = useChildRecitations(child);

  if (detail === null) return <p className="text-sm text-slate-500">جارٍ تحميل بيانات {child.studentName}…</p>;
  if (detail === "error") return <p className="text-sm text-red-600">تعذّر تحميل البيانات.</p>;

  const { summary } = detail;
  const pct = Math.min(100, (summary.pagesCovered / summary.totalPages) * 100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-naskh text-xl font-bold text-slate-800">{child.studentName}</h1>
        <p className="text-xs text-slate-500">حلقة «{child.halaqahName}»</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
          <div className="tabular text-xl font-bold text-orange-600">{summary.streak}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">أيام متتالية</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3.5 text-center">
          <div className="tabular text-xl font-bold text-emerald-700">{summary.pagesCovered}</div>
          <div className="mt-0.5 text-[11px] text-slate-500">صفحة محفوظة</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="mb-1.5 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-700">تقدّم الحفظ</h2>
          <span className="tabular text-xs text-slate-500">
            {summary.pagesCovered} من {summary.totalPages} صفحة
          </span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
        </div>
        {summary.lastHifz && (
          <p className="mt-1.5 text-xs text-slate-500">
            آخر ما وصل إليه: سورة {summary.lastHifz.surah} (صفحة {summary.lastHifz.page})
          </p>
        )}
      </div>

      <MonthlyPlanCard view={monthlyPlan} title="خطة هذا الشهر" />

      <AttendanceSummaryCard summary={attendance} />

      {recitations.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">آخر التلاوات</h2>
          <ul className="space-y-2">
            {recitations.map((r) => (
              <RecitationCard key={r.id} item={r} />
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">أوراد آخر ١٤ يوماً</h2>
        {summary.wards.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            لا أوراد مسجّلة في آخر ١٤ يوماً.
          </p>
        ) : (
          <ul className="space-y-2">
            {summary.wards.map((w, i) => (
              <li key={`${w.date}-${i}`} className="rounded-2xl border border-slate-200 bg-white p-3.5">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="tabular text-sm font-semibold text-slate-700">{w.date}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusTone(w.status)}`}>
                    {STATUS_LABEL[w.status]}
                  </span>
                </div>
                {w.hifz && <p className="text-sm text-slate-600">حفظ: {w.hifz}</p>}
                {w.review && <p className="text-sm text-slate-600">مراجعة: {w.review}</p>}
                {!w.hifz && !w.review && <p className="text-sm text-slate-400">—</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
