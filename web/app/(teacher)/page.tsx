"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import {
  CalendarIcon,
  ChartIcon,
  PlayIcon,
  PlusIcon,
  ShuffleIcon,
  SproutIcon,
  StarIcon,
} from "@/components/icons";
import { AreaChart, BarChart, Donut, Panel, PanelEmpty, TONES, type Tone } from "@/components/charts";
import type { DailyPoint } from "@/lib/chart-series";
import { attendanceTotals, masteryDistribution, type MasteryBucketKey } from "@/lib/students-stats";
import { useStudents } from "@/lib/store";
import type { SavedScheduleInfo, SavedScheduleRecord } from "@/lib/schedule";
import type { AttendanceSummary } from "@/lib/attendance";
import type { Student, WardLog } from "@/lib/types";

/* ————— لوحة ألوان الصفحة — كل القيم من رموز الهوية في globals.css ما عدا
   الهيرو الأسود: سطح أسود دائم بنص أبيض في الوضعين (كالقوائم الجانبية) ————— */
const C = {
  heroFrom: "#000000",
  heroTo: "#241B12",
  sand: "var(--color-sand)",
  cardBorder: "var(--color-border)",
  text: "var(--color-foreground)",
  textMuted: "var(--color-muted-foreground)",
};


/* ————— تواريخ وأسابيع — كل الحسابات بتوقيت UTC لتطابق date المخزَّنة (YYYY-MM-DD UTC) ————— */

function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}
function isoUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDaysUTC(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
/** بداية الأسبوع (الأحد) بتوقيت UTC لليوم المعطى */
function startOfWeekUTC(d: Date): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() - c.getUTCDay());
  return c;
}
/** أيام أسبوع كامل (٧ نصوص YYYY-MM-DD) بدءاً من الأحد */
function weekDates(startSunday: Date): Set<string> {
  return new Set(Array.from({ length: 7 }, (_, i) => isoUTC(addDaysUTC(startSunday, i))));
}

function pagesInRange(range: { from: number; to: number } | null): number {
  return range ? range.to - range.from + 1 : 0;
}

type Teacher = { teacherName: string; halaqahName: string };

/** يجمع بيانات لوحة المعلّم من أربعة مسارات قائمة أصلاً (me/wards/schedules/attendance-summary) — بلا أي endpoint جديد */
function useDashboardData() {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [wards, setWards] = useState<WardLog[] | null>(null);
  const [newCount, setNewCount] = useState(0);
  const [scheduleDays, setScheduleDays] = useState<SavedScheduleRecord["schedule"]["days"] | null>(null);
  // ملخصات الحضور والأوراد اليومية (مواصفة 003) — سلاسل رسوم اللوحة
  const [attendance, setAttendance] = useState<Record<string, AttendanceSummary>>({});
  const [wardsDaily, setWardsDaily] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [meRes, wardsRes, schedulesRes, summaryRes] = await Promise.all([
        fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/wards").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/schedules").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/attendance/summary").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cancelled) return;

      if (meRes?.teacher) setTeacher(meRes.teacher);
      setWards((wardsRes?.wards as WardLog[]) ?? []);
      setNewCount((wardsRes?.newCount as number) ?? 0);
      setAttendance((summaryRes?.summaries as Record<string, AttendanceSummary>) ?? {});
      setWardsDaily((summaryRes?.wardsDaily as DailyPoint[]) ?? []);

      // الجدول المحفوظ لشهرنا الحالي فقط — إن وُجد، نجلب محتواه الكامل (نداء ثانٍ لنفس /api/schedules)
      const now = todayUTC();
      const infos = (schedulesRes?.schedules as SavedScheduleInfo[]) ?? [];
      const current = infos.find((s) => s.year === now.getUTCFullYear() && s.month === now.getUTCMonth() + 1);
      if (current) {
        const full = await fetch(`/api/schedules?id=${current.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (!cancelled) setScheduleDays((full?.schedule as SavedScheduleRecord)?.schedule?.days ?? null);
      } else if (!cancelled) {
        setScheduleDays(null);
      }

      if (!cancelled) setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return { teacher, wards, newCount, scheduleDays, attendance, wardsDaily, loading };
}

export default function DashboardPage() {
  const { students, loading: studentsLoading, clear } = useStudents();
  const { teacher, wards, newCount, scheduleDays, attendance, wardsDaily, loading: dataLoading } = useDashboardData();
  const hasStudents = students.length > 0;

  const loading = studentsLoading || dataLoading;

  const stats = useMemo(() => {
    const now = todayUTC();
    const thisWeek = weekDates(startOfWeekUTC(now));

    const approved = (wards ?? []).filter((w) => w.status === "approved");

    // نجوم الأسبوع: أعلى ٣ طلاب بمجموع صفحات الحفظ المعتمدة هذا الأسبوع
    const perStudent = new Map<string, { name: string; pages: number }>();
    for (const w of approved) {
      if (!thisWeek.has(w.date)) continue;
      const p = pagesInRange(w.hifz);
      if (p <= 0) continue;
      const entry = perStudent.get(w.studentId) ?? { name: w.studentName, pages: 0 };
      entry.pages += p;
      perStudent.set(w.studentId, entry);
    }
    const starsOfWeek = [...perStudent.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.pages - a.pages)
      .slice(0, 3);

    // حلقة اليوم / القادمة من نفس جدول الشهر المحفوظ (إن وُجد)
    const todayIso = isoUTC(now);
    const todaySession = scheduleDays?.find((d) => d.date === todayIso) ?? null;
    const nextSession = scheduleDays
      ?.filter((d) => d.date > todayIso)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0] ?? null;

    return { starsOfWeek, todaySession, nextSession };
  }, [wards, scheduleDays]);

  if (loading) return <DashboardSkeleton />;

  // الهيكل الكامل يبقى ظاهراً دائماً حتى بلا طلاب (STEP 42) — الرسوم تُظهر
  // حالتها الفارغة بدل استبدال اللوحة كلها برسالة فراغ؛ بطاقة onboarding
  // تظهر أعلى الصفحة تحديداً.
  return (
    <div className="space-y-6">
      {!hasStudents && (
        <OnboardingBanner />
      )}

      <Hero teacherName={teacher?.teacherName} />

      {/* رسوم اللوحة (مواصفة 003) — مباشرةً تحت الهيرو */}
      <DashboardCharts students={students} attendance={attendance} wardsDaily={wardsDaily} />

      <QuickActions clearAction={clear} hasStudents={hasStudents} />

      <div className="grid gap-4 lg:grid-cols-2">
        <StarsOfWeek stars={stats.starsOfWeek} />
        <TodaySession today={stats.todaySession} next={stats.nextSession} />
      </div>

      {newCount > 0 && <PendingReview count={newCount} />}
    </div>
  );
}

/* ————— بطاقة onboarding — تظهر أعلى اللوحة بدل استبدالها بالكامل، طالما لا طلاب بعد ————— */

/**
 * أزرار الخطوة التالية فعلية لا كلامية: الاستيراد يظهر إن فعّله جامع الحلقة،
 * والانضمام للجامع يظهر فقط لمن حلقته ما زالت مستقلة (بلا جامع).
 */
export function OnboardingBanner() {
  const [importEnabled, setImportEnabled] = useState(false);
  const [mosqueJoined, setMosqueJoined] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/teacher/import")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled?: boolean } | null) => {
        if (!cancelled && data?.enabled) setImportEnabled(true);
      })
      .catch(() => {});
    fetch("/api/teacher/mosque")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { mosque?: { name: string } | null } | null) => {
        if (!cancelled) setMosqueJoined(Boolean(data?.mosque));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="flex flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-sm sm:flex-row sm:text-right"
      style={{ border: `1px solid ${C.cardBorder}` }}
    >
      <span className="shrink-0" style={{ color: C.heroTo }}>
        <SproutIcon size={44} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-lg font-bold" style={{ color: C.text }}>
          ابدأ رحلة حلقتك 🌱
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textMuted }}>
          لا يوجد طلاب بعد — اللوحة أدناه تعرض الهيكل الكامل بأصفار حتى تضيف طلابك.
        </p>
        {mosqueJoined === false && (
          <p className="mt-1 text-xs" style={{ color: C.textMuted }}>
            حلقتك ما زالت مستقلة — انضم لجامعك لتظهر في إدارته وتُفعَّل مزاياه.
          </p>
        )}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
        <Link href="/students">
          <Button>إضافة طالب</Button>
        </Link>
        {importEnabled && (
          <Link
            href="/students/import"
            className="flex items-center rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            استورد من Excel
          </Link>
        )}
        {mosqueJoined === false && (
          <Link
            href="/settings"
            className="flex items-center rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            انضم لجامع
          </Link>
        )}
      </div>
    </div>
  );
}

/* ————— بطاقة الترحيب (Hero) — الترحيب والتواريخ والآية فقط؛ الأرقام صارت بالبطاقات والرسوم أدناه ————— */

export function Hero({ teacherName }: { teacherName?: string }) {
  const gregorian = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric", weekday: "long" }).format(
    new Date(),
  );
  const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6 text-white sm:p-8"
      style={{ background: `linear-gradient(135deg, ${C.heroFrom}, ${C.heroTo})` }}
    >
      <IslamicPattern />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">
            السلام عليكم{teacherName ? `، أ. ${teacherName}` : ""}
          </h1>
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white/90">{gregorian}</span>
        </div>
        <p className="mt-1 text-sm text-white/85">{hijri}</p>
        <p className="mt-3 font-naskh text-sm italic text-white/80">«خيركم من تعلّم القرآن وعلّمه»</p>
      </div>
    </div>
  );
}

/* ————— رسوم اللوحة (مواصفة 003) — نفس مكوّنات صفحة الطلاب المشتركة ومسارها الجاهز ————— */

/** ألوان شرائح الإتقان — نفس خريطة لوحة الطلاب في students-dashboard/panels */
const MASTERY_TONES: Record<MasteryBucketKey, Tone> = {
  excellent: TONES.success,
  veryGood: TONES.accent100,
  good: TONES.accent70,
  needsFollowUp: TONES.destructive,
};

/** المساحي بعرض كامل ثم الإتقان والحضور جنباً إلى جنب من lg، عموديان على الجوّال */
export function DashboardCharts({
  students,
  attendance,
  wardsDaily,
}: {
  students: Student[];
  attendance: Record<string, AttendanceSummary>;
  wardsDaily: DailyPoint[];
}) {
  const wardsTotal = wardsDaily.reduce((sum, p) => sum + p.value, 0);
  const mastery = masteryDistribution(students);
  const totals = attendanceTotals(attendance);
  const totalMarks = totals.present + totals.late + totals.excused + totals.absent;

  return (
    <div className="space-y-4">
      <Panel title="أوراد الحلقة اليومية (٣٠ يوماً)">
        <AreaChart
          points={wardsDaily}
          ariaLabel={`أوراد الحلقة يومياً خلال آخر ٣٠ يوماً، الإجمالي ${wardsTotal} ورداً`}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="توزيع الإتقان">
          <Donut
            total={mastery.total}
            centerLabel="طالب"
            ariaLabel={`توزيع الإتقان: ${mastery.buckets.map((b) => `${b.label} ${b.count}`).join("، ")}`}
            slices={mastery.buckets.map((b) => ({
              label: b.label,
              value: b.count,
              pct: b.pct,
              tone: MASTERY_TONES[b.key],
            }))}
          />
        </Panel>

        <Panel title="الحضور (٣٠ يوماً)">
          {totalMarks === 0 ? (
            <PanelEmpty />
          ) : (
            <BarChart
              ariaLabel={`الحضور خلال ٣٠ يوماً: حاضر ${totals.present}، متأخر ${totals.late}، مستأذن ${totals.excused}، غائب ${totals.absent}`}
              bars={[
                { label: "حاضر", value: totals.present, tone: TONES.success },
                { label: "متأخر", value: totals.late, tone: TONES.accent100 },
                { label: "مستأذن", value: totals.excused, tone: TONES.accent45 },
                { label: "غائب", value: totals.absent, tone: TONES.destructive },
              ]}
            />
          )}
        </Panel>
      </div>
    </div>
  );
}

/** نقش هندسي إسلامي خفيف جداً (نجمة ثمانية مكررة) — خلفية زخرفية بحتة، تحتفظ بهوية التطبيق رغم تغيير اللون */
export function IslamicPattern() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="star8" width="56" height="56" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="white" strokeWidth="1.2">
            <path d="M28 4 L34 16 L28 28 L22 16 Z" />
            <path d="M28 28 L34 40 L28 52 L22 40 Z" />
            <path d="M4 28 L16 22 L28 28 L16 34 Z" />
            <path d="M28 28 L40 22 L52 28 L40 34 Z" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#star8)" />
    </svg>
  );
}

/* ————— إجراءات سريعة ————— */

export function QuickActions({ clearAction, hasStudents }: { clearAction: () => void; hasStudents: boolean }) {
  // تدرّجات من رموز الهوية فقط — كلها بتباين AA للنص الأبيض في الوضعين
  const items = [
    { href: "/students", from: "var(--color-accent-ink)", to: "var(--color-primary-hover)", icon: <PlusIcon size={26} />, title: "إضافة طالب", desc: "أضف طالباً جديداً للحلقة" },
    { href: "/pairing", from: "var(--color-success)", to: "var(--color-success-hover)", icon: <ShuffleIcon size={26} />, title: "مطابقة حلقة", desc: "ولّد ثنائيات تسميع هذا الأسبوع" },
    { href: "/reports", from: "var(--color-accent-hover)", to: "var(--color-accent-ink)", icon: <ChartIcon size={26} />, title: "تقرير الحلقة", desc: "أداء الحلقة الشهري" },
    { href: "/schedule", from: "var(--color-primary-hover)", to: "var(--color-primary)", icon: <CalendarIcon size={26} />, title: "جدول الشهر", desc: "اعتمد جدول التسميع الشهري" },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold" style={{ color: C.text }}>
          إجراءات سريعة
        </h2>
        {hasStudents && (
          <Button variant="danger" onClick={clearAction} className="no-print">
            مسح البيانات
          </Button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl p-5 text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            style={{ background: `linear-gradient(135deg, ${item.from}, ${item.to})` }}
          >
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-white/15">{item.icon}</div>
            <div className="font-semibold">{item.title}</div>
            <div className="mt-0.5 text-xs text-white/90">{item.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ————— نجوم الأسبوع — كقائمة متصدّرين (مربع ملوّن بالحروف + رقم الترتيب) ————— */

export function StarsOfWeek({ stars }: { stars: { id: string; name: string; pages: number }[] }) {
  // مراتب التصدّر: بيج فرنسي، راودو دست، ثم درجة البيج الغامقة — نص أسود يتباين معها جميعاً في الوضعين
  const rankColors = ["var(--color-secondary)", "var(--color-sand)", "var(--color-accent-ink)"];

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.cardBorder}` }}>
      <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold" style={{ color: C.text }}>
        <span style={{ color: C.sand }}>
          <StarIcon size={18} />
        </span>
        نجوم الأسبوع
      </h2>
      {stars.length === 0 ? (
        <p className="py-6 text-center text-sm" style={{ color: C.textMuted }}>
          ما فيه ورد محفوظ مُعتمَد هذا الأسبوع بعد — أول من يسمّع يظهر هنا.
        </p>
      ) : (
        <ul className="space-y-3">
          {stars.map((s, i) => (
            <li key={s.id} className="flex items-center gap-3">
              <div className="relative shrink-0">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold"
                  style={{ backgroundColor: rankColors[i] ?? rankColors[2], color: "var(--color-on-secondary)" }}
                >
                  {s.name.trim().charAt(0) || "؟"}
                </div>
                <span
                  className="tabular absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border-2 text-[10px] font-bold"
                  style={{
                    backgroundColor: C.text,
                    color: "var(--color-background)",
                    borderColor: "var(--color-surface)",
                  }}
                >
                  {i + 1}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium" style={{ color: C.text }}>
                  {s.name}
                </div>
              </div>
              <div className="tabular text-sm font-semibold" style={{ color: C.textMuted }}>
                {s.pages} صفحة
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ————— حلقة اليوم ————— */

export type SessionDay = SavedScheduleRecord["schedule"]["days"][number];

export function TodaySession({ today, next }: { today: SessionDay | null; next: SessionDay | null }) {
  const session = today ?? next;

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm" style={{ border: `1px solid ${C.cardBorder}` }}>
      <h2 className="mb-4 font-display text-lg font-bold" style={{ color: C.text }}>
        {today ? "حلقة اليوم" : "الجلسة القادمة"}
      </h2>

      {!session ? (
        <div className="py-6 text-center">
          <p className="text-sm" style={{ color: C.textMuted }}>
            لا جدول معتمَد لهذا الشهر بعد.
          </p>
          <Link href="/schedule">
            <Button className="mt-3">اذهب لجدول الشهر</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: C.textMuted }}>
            {session.weekdayName} · {session.pairs.length} ثنائية
            {session.unmatched.length > 0 ? ` · ${session.unmatched.length} بلا شريك` : ""}
          </p>
          <Link href="/pairing">
            <Button className="flex w-fit items-center gap-1.5">
              <PlayIcon size={16} />
              ابدأ التسميع
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

/* ————— بانتظار المراجعة (أوراد جديدة) — بيانات حقيقية من /api/wards ————— */

export function PendingReview({ count }: { count: number }) {
  // بانتظار المراجعة = تحذير → لهجة accent وفق خريطة الشارات المعتمدة
  return (
    <Link
      href="/inbox"
      className="flex items-center gap-4 rounded-2xl border border-accent/40 bg-accent-soft p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5"
    >
      <span className="tabular flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-base font-bold text-on-secondary">
        {count}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold" style={{ color: C.text }}>
          أوراد بانتظار المراجعة
        </div>
        <div className="mt-0.5 text-xs" style={{ color: C.textMuted }}>
          أوراد جديدة أرسلها الطلاب، بحاجة اطّلاعك أو اعتمادك
        </div>
      </div>
      <Button className="shrink-0">مراجعة الوارد</Button>
    </Link>
  );
}

/* ————— هيكل تحميل (Skeleton) ————— */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-black/5 ${className}`} />;
}

function DashboardSkeleton() {
  // يطابق ترتيب اللوحة: الهيرو، الرسم المساحي، لوحتا الإتقان والحضور، الإجراءات
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-36" />
      <SkeletonBlock className="h-64" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-48" />
        <SkeletonBlock className="h-48" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonBlock className="h-48" />
        <SkeletonBlock className="h-48" />
      </div>
    </div>
  );
}
