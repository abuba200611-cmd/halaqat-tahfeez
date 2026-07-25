"use client";

import { useState } from "react";
import { Badge, Button, Card, Empty, Stat } from "@/components/ui";
import { DEFAULT_SETTINGS, generatePairs, pageCount, studentJuzes } from "@/lib/pairing";
import { juzLabel } from "@/lib/quran";
import { useStudents } from "@/lib/store";
import type { PairingResult, PairingSettings } from "@/lib/types";

export default function PairingPage() {
  const { students, loading } = useStudents();
  const [settings, setSettings] = useState<PairingSettings>(DEFAULT_SETTINGS);
  const [result, setResult] = useState<PairingResult | null>(null);

  const active = students.filter((s) => s.active);

  if (loading) {
    return <Empty title="جارٍ تحميل الطلاب…" />;
  }

  if (students.length === 0) {
    return <Empty title="أضف الطلاب أولاً، ثم عُد لتوليد الثنائيات." />;
  }

  function run() {
    setResult(generatePairs(students, settings));
  }

  const matchRate = result && active.length ? (result.pairs.length * 2) / active.length : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-naskh text-2xl font-bold">مطابقة التسميع</h1>
        <div className="no-print flex gap-2">
          <Button onClick={run}>توليد الثنائيات</Button>
          {result && (
            <Button variant="ghost" onClick={() => window.print()}>
              طباعة
            </Button>
          )}
        </div>
      </div>

      <Card className="no-print p-4">
        <h2 className="mb-3 text-sm font-semibold">معايير المطابقة</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Slider
            label="أقل تقاطع مقبول"
            suffix="صفحة"
            value={settings.minOverlapPages}
            min={5}
            max={120}
            onChange={(v) => setSettings({ ...settings, minOverlapPages: v })}
            hint="أقل مقدار مشترك يسمح لهما بالتسميع لبعض"
          />
          <Slider
            label="أقصى فارق إتقان"
            suffix="نقطة"
            value={settings.maxMasteryGap}
            min={5}
            max={60}
            onChange={(v) => setSettings({ ...settings, maxMasteryGap: v })}
            hint="فارق أكبر يعني أن أحدهما يضيع وقته"
          />
          <Slider
            label="خصم تكرار الشريك"
            suffix="نقطة"
            value={settings.repeatPenalty}
            min={0}
            max={100}
            onChange={(v) => setSettings({ ...settings, repeatPenalty: v })}
            hint="لتدوير الشركاء بين الأسابيع"
          />
        </div>
      </Card>

      {!result ? (
        <Empty title={`جاهز — ${active.length} طالباً نشطاً. اضغط «توليد الثنائيات».`} />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="الثنائيات" value={result.pairs.length} />
            <Stat
              label="نسبة التغطية"
              value={`${Math.round(matchRate * 100)}٪`}
              hint={`${result.pairs.length * 2} من ${active.length}`}
            />
            <Stat label="بلا شريك" value={result.unmatched.length} hint="يحتاجون المعلّم" />
            <Stat
              label="الأزواج الممكنة"
              value={result.candidateCount.toLocaleString("en")}
              hint={`حُسبت في ${result.elapsedMs} م.ث`}
            />
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-right text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 font-medium">الطالب الأول</th>
                  <th className="px-3 py-2 font-medium">الطالب الثاني</th>
                  <th className="px-3 py-2 font-medium">المقرر المشترك</th>
                  <th className="px-3 py-2 font-medium">التقاطع</th>
                  <th className="px-3 py-2 font-medium">فارق الإتقان</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.pairs.map((pair, index) => (
                  <tr key={`${pair.a.id}-${pair.b.id}`} className="transition-colors duration-200 hover:bg-muted/40">
                    <td className="tabular px-3 py-2 text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2">{pair.a.name}</td>
                    <td className="px-3 py-2">{pair.b.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{juzLabel(pair.overlapJuz)}</td>
                    <td className="tabular px-3 py-2">{pair.overlapPages} ص</td>
                    <td className="px-3 py-2">
                      <Badge tone={pair.gap <= 10 ? "good" : pair.gap <= 20 ? "neutral" : "warn"}>
                        {Math.round(pair.gap)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          {result.unmatched.length > 0 && (
            <Card className="p-4">
              <h2 className="mb-1 font-naskh text-lg font-bold">بلا شريك</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                لا يوجد من يشاركهم مقرراً كافياً بإتقان متقارب. يسمّعون للمعلّم، أو يُضمّون لثنائية قائمة.
              </p>
              <ul className="divide-y divide-border">
                {result.unmatched.map((student) => (
                  <li key={student.id} className="flex items-center justify-between py-2 text-sm">
                    <span>{student.name}</span>
                    <span className="tabular text-muted-foreground">
                      {pageCount(student)} صفحة · {juzLabel(studentJuzes(student))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  suffix,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  hint: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular font-medium">
          {value} {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full cursor-pointer accent-primary"
      />
      <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}
