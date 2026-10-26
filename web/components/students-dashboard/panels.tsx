import { Donut } from "./donut";
import { BarChart } from "./bar-chart";
import { Chip, Dot, Panel, PanelEmpty, TONES, pillClass, type Tone } from "./panel";
import type { AttendanceSummary } from "@/lib/attendance";
import { STATUS_LABELS, type FeeStatus } from "@/lib/fees";
import {
  attendanceTotals,
  feeBreakdown,
  masteryDistribution,
  topStudents,
  type MasteryBucketKey,
} from "@/lib/students-stats";
import type { Student } from "@/lib/types";

const MASTERY_TONES: Record<MasteryBucketKey, Tone> = {
  excellent: TONES.success,
  veryGood: TONES.accent100,
  good: TONES.accent70,
  needsFollowUp: TONES.destructive,
};

const FEE_TONES: Record<FeeStatus, Tone> = {
  paid: TONES.success,
  partial: TONES.accent70,
  due: TONES.destructive,
  waived: TONES.accent25,
};

/** صف لوحات الرسوم البيانية أعلى جدول الطلاب: الإتقان، الحضور، ثم الرسوم أو أعلى الطلاب */
export function StudentsPanels({
  students,
  attendance,
  fees,
  avgAttendance,
}: {
  students: Student[];
  attendance: Record<string, AttendanceSummary>;
  fees: Record<string, { status: FeeStatus }> | null;
  avgAttendance: number | null;
}) {
  const mastery = masteryDistribution(students);
  const totals = attendanceTotals(attendance);
  const totalMarks = totals.present + totals.late + totals.excused + totals.absent;

  return (
    <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
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
          <>
            <div className="mb-2 flex items-center gap-2">
              <span className="tabular text-2xl font-semibold text-foreground">
                {avgAttendance === null ? "—" : `${avgAttendance}٪`}
              </span>
              {avgAttendance !== null && (
                <Chip tone={avgAttendance >= 75 ? "success" : "neutral"} arrow={avgAttendance >= 75 ? "up" : undefined}>
                  متوسط الحضور
                </Chip>
              )}
            </div>
            <BarChart
              ariaLabel={`الحضور خلال ٣٠ يوماً: حاضر ${totals.present}، متأخر ${totals.late}، مستأذن ${totals.excused}، غائب ${totals.absent}`}
              bars={[
                { label: "حاضر", value: totals.present, tone: TONES.success },
                { label: "متأخر", value: totals.late, tone: TONES.accent100 },
                { label: "مستأذن", value: totals.excused, tone: TONES.accent45 },
                { label: "غائب", value: totals.absent, tone: TONES.destructive },
              ]}
            />
          </>
        )}
      </Panel>

      {fees !== null ? <FeesPanel students={students} fees={fees} /> : <TopStudentsPanel students={students} />}
    </div>
  );
}

function FeesPanel({ students, fees }: { students: Student[]; fees: Record<string, { status: FeeStatus }> }) {
  const { total, buckets } = feeBreakdown(students, fees);
  return (
    <Panel title="الرسوم">
      <Donut
        total={total}
        centerLabel="طالب"
        ariaLabel={`حالة الرسوم: ${buckets.map((b) => `${STATUS_LABELS[b.status]} ${b.count}`).join("، ")}`}
        slices={buckets.map((b) => ({
          label: STATUS_LABELS[b.status],
          value: b.count,
          pct: b.pct,
          tone: FEE_TONES[b.status],
        }))}
      />
    </Panel>
  );
}

function TopStudentsPanel({ students }: { students: Student[] }) {
  const top = topStudents(students, 5);
  return (
    <Panel
      title="أعلى الطلاب إتقاناً"
      action={
        <a href="#students-table" className={pillClass}>
          عرض الكل
        </a>
      }
    >
      {top.length === 0 ? (
        <PanelEmpty />
      ) : (
        <ul className="space-y-3">
          {top.map((s) => (
            <li key={s.id} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink"
              >
                {Array.from(s.name.trim())[0] ?? "؟"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{s.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{s.group || "—"}</span>
              </span>
              <span className="tabular flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Dot tone={s.mastery >= 75 ? TONES.success : TONES.accent70} />
                {s.mastery}٪
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
