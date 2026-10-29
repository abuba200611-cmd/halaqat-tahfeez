import { Donut, Panel, TONES } from "@/components/charts";
import { safePct } from "@/lib/chart-series";
import type { AttendanceSummary } from "@/lib/attendance";

/*
  حضور آخر ٣٠ يوماً (عند الطالب وولي الأمر، قراءة فقط) — دونات من المكتبة
  المشتركة بدل بطاقات الأرقام: المجموع في المنتصف والحالات بمفتاح الرسم.
*/

/** حالات الحضور بالترتيب وألوانها — نفس ترتيب لوحة المعلّم */
const MARKS: { key: keyof Pick<AttendanceSummary, "present" | "late" | "excused" | "absent">; label: string; tone: typeof TONES.success }[] = [
  { key: "present", label: "حاضر", tone: TONES.success },
  { key: "late", label: "متأخر", tone: TONES.accent100 },
  { key: "excused", label: "مستأذن", tone: TONES.accent45 },
  { key: "absent", label: "غائب", tone: TONES.destructive },
];

export function AttendanceSummaryCard({ summary }: { summary: AttendanceSummary | null }) {
  const marks = summary ?? { present: 0, late: 0, excused: 0, absent: 0 };
  const total = marks.present + marks.late + marks.excused + marks.absent;

  return (
    <Panel title="الحضور (٣٠ يوماً)">
      <Donut
        total={total}
        centerLabel="تسجيل"
        ariaLabel={`الحضور خلال ٣٠ يوماً: ${MARKS.map((m) => `${m.label} ${marks[m.key]}`).join("، ")}`}
        slices={MARKS.map((m) => ({
          label: m.label,
          value: marks[m.key],
          pct: safePct(marks[m.key], total),
          tone: m.tone,
        }))}
      />
    </Panel>
  );
}
