"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BookIcon,
  CalendarIcon,
  ChartIcon,
  FlameIcon,
  PlayIcon,
  PlusIcon,
  ShuffleIcon,
  SproutIcon,
  StarIcon,
  UsersIcon,
} from "@/components/icons";
import { useStudents } from "@/lib/store";
import type { SavedScheduleInfo, SavedScheduleRecord } from "@/lib/schedule";
import type { WardLog } from "@/lib/types";

/* ————— لوحة ألوان الصفحة (STEP 40) — محصورة هنا، لا تمسّ رموز الثيم العامة ————— */
const C = {
  emerald: "#0F766E",
  emeraldLight: "#14B8A6",
  gold: "#D4A24C",
  pageBg: "#F6F9F8",
  cardBorder: "#E6EEEC",
  text: "#0F172A",
  textMuted: "#64748B",
};

const MAX_DEMO = 1000;

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

/** أيام متتالية (بالحلقة كلها) فيها ورد واحد على الأقل، بدءاً من اليوم أو أمس لو اليوم لسه بلا ورد */
function computeStreak(activeDates: Set<string>): number {
  let cursor = todayUTC();
  if (!activeDates.has(isoUTC(cursor))) cursor = addDaysUTC(cursor, -1);
  let streak = 0;
  while (activeDates.has(isoUTC(cursor))) {
    streak++;
    cursor = addDaysUTC(cursor, -1);
  }
  return streak;
}

/** عدّاد متحرك خفيف (~600ms)، يحترم تفضيل تقليل الحركة */
function useCountUp(target: number, durationMs = 600): number {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!Number.isFinite(target)) return;

    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const effectiveDuration = reduced ? 0 : durationMs;

    let raf = 0;
    const start = performance.now();
    // كل تحديث للحالة يقع داخل هذا الاستدعاء (مُشغَّل عبر requestAnimationFrame)
    // لا مباشرة بجسم الأثر — بلا حركة، الإطار الأول يصل t=1 فوراً فيقفز للقيمة
    // النهائية بلا أي وميض.
    function tick(now: number) {
      const t = effectiveDuration === 0 ? 1 : Math.min(1, (now - start) / effectiveDuration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

type Teacher = { teacherName: string; halaqahName: string };

/** يجمع بيانات لوحة المعلّم من ثلاثة مسارات قائمة أصلاً (me/wards/schedules) — بلا أي endpoint جديد */
function useDashboardData() {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [wards, setWards] = useState<WardLog[] | null>(null);
  const [scheduleDays, setScheduleDays] = useState<SavedScheduleRecord["schedule"]["days"] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [meRes, wardsRes, schedulesRes] = await Promise.all([
        fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/wards").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/schedules").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (cancelled) return;

      if (meRes?.teacher) setTeacher(meRes.teacher);
      setWards((wardsRes?.wards as WardLog[]) ?? []);

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

  return { teacher, wards, scheduleDays, loading };
}

export default function DashboardPage() {
  const { students, loading: studentsLoading, loadDemo, clear } = useStudents();
  const { teacher, wards, scheduleDays, loading: dataLoading } = useDashboardData();
  const [demoCount, setDemoCount] = useState(150);
  const active = students.filter((s) => s.active);

  const loading = studentsLoading || dataLoading;

  const stats = useMemo(() => {
    const now = todayUTC();
    const thisWeekStart = startOfWeekUTC(now);
    const lastWeekStart = addDaysUTC(thisWeekStart, -7);
    const thisWeek = weekDates(thisWeekStart);
    const lastWeek = weekDates(lastWeekStart);

    const list = wards ?? [];
    const approved = list.filter((w) => w.status === "approved");

    const sumHifzPages = (dates: Set<string>) =>
      approved.filter((w) => dates.has(w.date)).reduce((sum, w) => sum + pagesInRange(w.hifz), 0);

    const pagesThisWeek = sumHifzPages(thisWeek);
    const pagesLastWeek = sumHifzPages(lastWeek);

    const activeDates = new Set(list.map((w) => w.date));
    const streak = computeStreak(activeDates);

    const participatingThisWeek = new Set(list.filter((w) => thisWeek.has(w.date)).map((w) => w.studentId));
    const participationPct =
      active.length > 0 ? Math.round((participatingThisWeek.size / active.length) * 100) : null;

    const sessionsInWeek = (dates: Set<string>) =>
      scheduleDays ? scheduleDays.filter((d) => dates.has(d.date)).length : null;
    const sessionsThisWeek = sessionsInWeek(thisWeek);
    const sessionsLastWeek = sessionsInWeek(lastWeek);

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

    return {
      pagesThisWeek,
      pagesDelta: wards ? pagesThisWeek - pagesLastWeek : null,
      streak,
      participationPct,
      sessionsThisWeek,
      sessionsDelta: sessionsThisWeek !== null && sessionsLastWeek !== null ? sessionsThisWeek - sessionsLastWeek : null,
      starsOfWeek,
      todaySession,
      nextSession,
    };
  }, [wards, scheduleDays, active.length]);

  if (loading) return <DashboardSkeleton />;

  if (students.length === 0) {
    return <EmptyDashboard demoCount={demoCount} setDemoCount={setDemoCount} loadDemo={loadDemo} />;
  }

  return (
    <div className="space-y-6">
      <Hero
        teacherName={teacher?.teacherName}
        participationPct={stats.participationPct}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<UsersIcon size={22} />}
          label="عدد الطلاب"
          value={active.length}
          hint={`${new Set(active.map((s) => s.group)).size} مجموعات`}
        />
        <StatCard
          icon={<BookIcon size={22} />}
          label="صفحات محفوظة — هذا الأسبوع"
          value={stats.pagesThisWeek}
          delta={stats.pagesDelta}
        />
        <StatCard
          icon={<CalendarIcon size={22} />}
          label="الحلقات هذا الأسبوع"
          value={stats.sessionsThisWeek}
          delta={stats.sessionsDelta}
        />
        <StatCard
          icon={<FlameIcon size={22} />}
          label="أيام متتالية نشطة"
          value={stats.streak}
          gold
        />
      </div>

      <QuickActions clearAction={clear} />

      <div className="grid gap-4 lg:grid-cols-2">
        <StarsOfWeek stars={stats.starsOfWeek} />
        <TodaySession today={stats.todaySession} next={stats.nextSession} />
      </div>
    </div>
  );
}

/* ————— بطاقة الترحيب (Hero) ————— */

function Hero({ teacherName, participationPct }: { teacherName?: string; participationPct: number | null }) {
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
      style={{ background: `linear-gradient(135deg, ${C.emerald}, ${C.emeraldLight})` }}
    >
      <IslamicPattern />
      <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-naskh text-2xl font-bold sm:text-3xl">
            السلام عليكم{teacherName ? `، أ. ${teacherName}` : ""}
          </h1>
          <p className="mt-1 text-sm text-white/85">
            {gregorian} · {hijri}
          </p>
          <p className="mt-3 font-naskh text-sm italic text-white/80">«خيركم من تعلّم القرآن وعلّمه»</p>
        </div>

        {participationPct !== null && (
          <div className="hidden shrink-0 sm:block">
            <ProgressRing percent={participationPct} />
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 92;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.25)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="white"
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular text-lg font-bold text-white">{clamped}٪</span>
        <span className="text-[10px] leading-tight text-white/80">نشاط الأسبوع</span>
      </div>
    </div>
  );
}

/** نقش هندسي إسلامي خفيف جداً (نجمة ثمانية مكررة) — خلفية زخرفية بحتة */
function IslamicPattern() {
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

/* ————— بطاقة إحصائية ————— */

function StatCard({
  icon,
  label,
  value,
  hint,
  delta,
  gold,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | null;
  hint?: string;
  delta?: number | null;
  gold?: boolean;
}) {
  const animated = useCountUp(value ?? 0);
  const iconTone = gold ? C.gold : C.emerald;

  return (
    <div
      className="rounded-2xl bg-white p-5 shadow-sm"
      style={{ border: `1px solid ${C.cardBorder}` }}
    >
      <div
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: `${iconTone}1A`, color: iconTone }}
      >
        {icon}
      </div>
      <div className="tabular text-3xl font-bold" style={{ color: C.text }}>
        {value === null ? "—" : animated.toLocaleString("en")}
      </div>
      <div className="mt-1 text-xs" style={{ color: C.textMuted }}>
        {label}
      </div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: C.textMuted }}>
          {hint}
        </div>
      )}
      {delta !== undefined && delta !== null && delta !== 0 && (
        <div className={`mt-1 flex items-center gap-1 text-xs ${delta > 0 ? "text-emerald-600" : "text-slate-400"}`}>
          {delta > 0 ? <ArrowUpIcon size={12} /> : <ArrowDownIcon size={12} />}
          <span className="tabular">
            {Math.abs(delta)} عن الأسبوع الماضي
          </span>
        </div>
      )}
    </div>
  );
}

/* ————— إجراءات سريعة ————— */

function QuickActions({ clearAction }: { clearAction: () => void }) {
  const items = [
    { href: "/students", icon: <PlusIcon size={26} />, title: "إضافة طالب", desc: "أضف طالباً جديداً للحلقة" },
    { href: "/pairing", icon: <ShuffleIcon size={26} />, title: "مطابقة حلقة", desc: "ولّد ثنائيات تسميع هذا الأسبوع" },
    { href: "/reports", icon: <ChartIcon size={26} />, title: "تقرير الحلقة", desc: "أداء الحلقة الشهري" },
    { href: "/schedule", icon: <CalendarIcon size={26} />, title: "جدول الشهر", desc: "اعتمد جدول التسميع الشهري" },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-naskh text-lg font-bold" style={{ color: C.text }}>
          إجراءات سريعة
        </h2>
        <Button variant="danger" onClick={clearAction} className="no-print">
          مسح البيانات
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group rounded-2xl bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
            style={{ border: `1px solid ${C.cardBorder}` }}
          >
            <div
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-200 group-hover:text-white"
              style={{ backgroundColor: `${C.emerald}1A`, color: C.emerald }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = C.emerald)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = `${C.emerald}1A`)}
            >
              {item.icon}
            </div>
            <div className="font-semibold" style={{ color: C.text }}>
              {item.title}
            </div>
            <div className="mt-0.5 text-xs" style={{ color: C.textMuted }}>
              {item.desc}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ————— نجوم الأسبوع ————— */

function StarsOfWeek({ stars }: { stars: { id: string; name: string; pages: number }[] }) {
  return (
    <div className="rounded-2xl border border-[#E6EEEC] bg-white p-5 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 font-naskh text-lg font-bold" style={{ color: C.text }}>
        <span style={{ color: C.gold }}>
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
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ backgroundColor: i === 0 ? C.gold : C.emerald }}
              >
                {s.name.trim().charAt(0) || "؟"}
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

type SessionDay = SavedScheduleRecord["schedule"]["days"][number];

function TodaySession({ today, next }: { today: SessionDay | null; next: SessionDay | null }) {
  const session = today ?? next;

  return (
    <div className="rounded-2xl border border-[#E6EEEC] bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-naskh text-lg font-bold" style={{ color: C.text }}>
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

/* ————— حالة اللوحة الفارغة (بلا طلاب) ————— */

function EmptyDashboard({
  demoCount,
  setDemoCount,
  loadDemo,
}: {
  demoCount: number;
  setDemoCount: (n: number) => void;
  loadDemo: (n: number) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span style={{ color: C.emeraldLight }}>
        <SproutIcon size={64} />
      </span>
      <h1 className="mt-4 font-naskh text-2xl font-bold" style={{ color: C.text }}>
        ابدأ رحلة حلقتك 🌱
      </h1>
      <p className="mt-2 max-w-sm text-sm" style={{ color: C.textMuted }}>
        لا يوجد طلاب بعد. أضف طلابك الحقيقيين، أو جرّب حلقة تجريبية بالعدد الذي تريده لاستكشاف اللوحة أولاً.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Link href="/students">
          <Button>إضافة طالب</Button>
        </Link>
        <label className="flex items-center gap-2 text-sm" style={{ color: C.textMuted }}>
          العدد
          <input
            type="number"
            min={2}
            max={MAX_DEMO}
            value={demoCount}
            onChange={(e) => setDemoCount(Number(e.target.value))}
            className="tabular w-24 rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </label>
        <Button
          variant="ghost"
          onClick={() => loadDemo(Math.min(MAX_DEMO, Math.max(2, demoCount)))}
          disabled={!Number.isFinite(demoCount) || demoCount < 2}
        >
          تحميل حلقة تجريبية
        </Button>
      </div>
    </div>
  );
}

/* ————— هيكل تحميل (Skeleton) ————— */

function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-black/5 ${className}`} />;
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <SkeletonBlock className="h-40" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonBlock key={i} className="h-28" />
        ))}
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
