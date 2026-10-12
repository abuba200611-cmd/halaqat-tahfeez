"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty, Stat } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { useApi } from "@/components/mosque/use-api";
import { PERIOD_CHOICES, periodLabel, type PeriodChoice } from "@/lib/mosque/report-periods";

type HalaqahRow = {
  rank: number | null;
  halaqahId: number;
  name: string;
  teacherName: string;
  available: boolean;
  score: number | null;
  activeStudents: number | null;
  avgEngagement: number | null;
  attendanceRate: number | null;
  planOnTrackRatio: number | null;
  wardsApproved: number | null;
  hifzPages: number | null;
};

type StudentRow = {
  rank: number;
  name: string;
  halaqahId: number;
  halaqahName: string;
  engagementScore: number;
  attendanceRate: number | null;
  streak: number;
  programsScore: number | null;
  combinedScore: number;
  matched: boolean;
  badges: { icon: string; name: string }[];
};

type HonorBoardData = {
  mosque: { name: string; city: string };
  period: { from: string; to: string };
  halaqahs: HalaqahRow[];
  students: StudentRow[];
  rankedStudents: number;
  unmatchedCount: number;
};

const MEDALS = ["🥇", "🥈", "🥉"];

/** لوحة الشرف — ترتيب الحلقات والطلاب بدرجات التفاعل وبرامج الجامع لفترة مختارة */
export default function HonorBoardPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/honor-board`} title="لوحة الشرف">
      <HonorBoardSection mosqueId={mosqueId} />
    </MosquePage>
  );
}

function HonorBoardSection({ mosqueId }: { mosqueId: number }) {
  const [choice, setChoice] = useState<PeriodChoice>("this_week");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const url =
    choice === "custom"
      ? from && to
        ? `/api/mosques/${mosqueId}/honor-board?period=custom&from=${from}&to=${to}`
        : null
      : `/api/mosques/${mosqueId}/honor-board?period=${choice}`;
  const { data, status, loading } = useApi<HonorBoardData>(url);

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-3 p-4 print:hidden">
        <label className="block text-xs text-muted-foreground">
          الفترة
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value as PeriodChoice)}
            className={`${inputClass} mt-1 w-44`}
          >
            {PERIOD_CHOICES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {choice === "custom" && (
          <>
            <label className="block text-xs text-muted-foreground">
              من
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputClass} tabular mt-1`} />
            </label>
            <label className="block text-xs text-muted-foreground">
              إلى
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${inputClass} tabular mt-1`} />
            </label>
          </>
        )}
        {data && (
          <Button variant="ghost" className="ms-auto" onClick={() => window.print()}>
            طباعة / حفظ PDF
          </Button>
        )}
      </Card>

      {choice === "custom" && (!from || !to) ? (
        <Empty title="اختر تاريخي البداية والنهاية للنطاق المخصص." />
      ) : !data ? (
        <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="لوحة الشرف" />
      ) : data.halaqahs.length === 0 ? (
        <Empty title="لا حلقات مضافة بعد — لوحة الشرف تظهر بعد إضافة الحلقات وربطها بنظام المعلّم." />
      ) : (
        <HonorBoardBody mosqueId={mosqueId} data={data} />
      )}
    </div>
  );
}

function HonorBoardBody({ mosqueId, data }: { mosqueId: number; data: HonorBoardData }) {
  const podium = data.halaqahs.filter((halaqah) => halaqah.rank !== null && halaqah.rank <= 3);
  // ترتيب العرض: الثاني، الأول، الثالث — الأول بالوسط وأعلى قليلاً
  const podiumOrder = podium.length === 3 ? [podium[1], podium[0], podium[2]] : podium;
  const unavailable = data.halaqahs.filter((halaqah) => !halaqah.available).length;

  return (
    <div className="space-y-5">
      {/* رأس اللوحة — يظهر عند الطباعة */}
      <div className="print:mb-4 print:border-b print:border-border print:pb-3">
        <h2 className="font-naskh text-xl font-bold">{data.mosque.name}</h2>
        <p className="text-sm text-muted-foreground">
          لوحة الشرف — فترة: {periodLabel(data.period)}
          <span className="tabular"> ({data.period.from} — {data.period.to})</span>
        </p>
      </div>

      {podium.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          {podiumOrder.map((halaqah) => (
            <Card
              key={halaqah.halaqahId}
              className={`p-4 text-center ${halaqah.rank === 1 ? "sm:p-6 print:p-6" : "opacity-95"}`}
            >
              <div className="text-3xl">{MEDALS[(halaqah.rank as number) - 1]}</div>
              <Link
                href={`/mosque/${mosqueId}/halaqah/${halaqah.halaqahId}`}
                className="mt-1 block font-naskh text-lg font-bold text-primary hover:underline"
              >
                {halaqah.name}
              </Link>
              <p className="text-xs text-muted-foreground">{halaqah.teacherName}</p>
              <div className="tabular mt-2 text-3xl font-bold">{halaqah.score}</div>
              <p className="text-xs text-muted-foreground">من 100</p>
              <div className="tabular mt-3 flex justify-center gap-3 text-xs text-muted-foreground">
                <span>تفاعل {halaqah.avgEngagement ?? "—"}٪</span>
                <span>حضور {formatPercent(halaqah.attendanceRate)}</span>
                <span>{halaqah.activeStudents ?? "—"} طالب</span>
              </div>
            </Card>
          ))}
        </div>
      )}

      {unavailable > 0 && (
        <p className="text-xs text-accent">
          تعذّر جلب مقاييس {unavailable} حلقة من نظام المعلّم — استُثنيت من الترتيب.
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <Stat label="حلقات مرتَّبة" value={podium.length > 0 ? data.halaqahs.filter((h) => h.available).length : 0} />
        <Stat
          label="طلاب مرتَّبون"
          value={data.rankedStudents}
          hint={data.unmatchedCount > 0 ? `${data.unmatchedCount} بلا سجل برامج مطابق` : undefined}
        />
      </div>

      <Card className="overflow-x-auto p-4">
        <h3 className="mb-3 font-semibold">ترتيب الحلقات</h3>
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-2 py-2 text-start font-medium">#</th>
              <th className="px-2 py-2 text-start font-medium">الحلقة</th>
              <th className="px-2 py-2 text-start font-medium">المعلّم</th>
              <th className="px-2 py-2 text-center font-medium">الدرجة</th>
              <th className="px-2 py-2 text-center font-medium">التفاعل</th>
              <th className="px-2 py-2 text-center font-medium">الحضور</th>
              <th className="px-2 py-2 text-center font-medium">الخطة</th>
              <th className="px-2 py-2 text-center font-medium">وردات معتمدة</th>
              <th className="px-2 py-2 text-center font-medium">المحفوظ (صفحة)</th>
              <th className="px-2 py-2 text-center font-medium">الطلاب</th>
            </tr>
          </thead>
          <tbody>
            {data.halaqahs.map((halaqah) => (
              <tr key={halaqah.halaqahId} className="border-b border-border/60 last:border-0">
                <td className="px-2 py-2">
                  {halaqah.rank === null ? <span className="text-muted-foreground">—</span> : <Badge tone={halaqah.rank <= 3 ? "warn" : "neutral"}>{halaqah.rank}</Badge>}
                </td>
                <td className="px-2 py-2 font-medium">
                  <Link href={`/mosque/${mosqueId}/halaqah/${halaqah.halaqahId}`} className="text-primary hover:underline">
                    {halaqah.name}
                  </Link>
                </td>
                <td className="px-2 py-2 text-muted-foreground">{halaqah.teacherName}</td>
                {halaqah.available ? (
                  <>
                    <td className="tabular px-2 py-2 text-center font-bold">{halaqah.score}</td>
                    <td className="tabular px-2 py-2 text-center">{halaqah.avgEngagement ?? "—"}٪</td>
                    <td className="tabular px-2 py-2 text-center">{formatPercent(halaqah.attendanceRate)}</td>
                    <td className="tabular px-2 py-2 text-center">{formatRatio(halaqah.planOnTrackRatio)}</td>
                    <td className="tabular px-2 py-2 text-center">{halaqah.wardsApproved ?? "—"}</td>
                    <td className="tabular px-2 py-2 text-center">{halaqah.hifzPages ?? "—"}</td>
                    <td className="tabular px-2 py-2 text-center">{halaqah.activeStudents ?? "—"}</td>
                  </>
                ) : (
                  <td colSpan={7} className="px-2 py-2 text-center">
                    <Badge tone="warn">غير متاح من نظام المعلّم</Badge>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-4">
        <h3 className="mb-3 font-semibold">أفضل {data.students.length} طلاب بالجامع</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          الدرجة المجمّعة = 70٪ تفاعل (نظام المعلّم) + 30٪ برامج الجامع (تقييم أسبوعي، أوسمة، أسر ولجان، أنشطة).
        </p>
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-2 py-2 text-start font-medium">#</th>
              <th className="px-2 py-2 text-start font-medium">الطالب</th>
              <th className="px-2 py-2 text-start font-medium">الحلقة</th>
              <th className="px-2 py-2 text-center font-medium">التفاعل</th>
              <th className="px-2 py-2 text-center font-medium">البرامج</th>
              <th className="px-2 py-2 text-center font-medium">الدرجة</th>
              <th className="px-2 py-2 text-center font-medium">الأوسمة</th>
            </tr>
          </thead>
          <tbody>
            {data.students.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-4 text-center text-sm text-muted-foreground">
                  لا طلاب بمقاييس هذه الفترة.
                </td>
              </tr>
            ) : (
              data.students.map((student) => (
                <tr key={`${student.halaqahId}-${student.name}`} className="border-b border-border/60 last:border-0">
                  <td className="px-2 py-2">
                    <Badge tone={student.rank <= 3 ? "warn" : "neutral"}>{student.rank}</Badge>
                  </td>
                  <td className="px-2 py-2 font-medium">{student.name}</td>
                  <td className="px-2 py-2 text-muted-foreground">{student.halaqahName}</td>
                  <td className="tabular px-2 py-2 text-center">{student.engagementScore}٪</td>
                  <td className="tabular px-2 py-2 text-center" title={student.matched ? undefined : "لا سجل مطابق بالاسم بقاعدة الجامع"}>
                    {student.programsScore === null ? "—" : `${student.programsScore}٪`}
                  </td>
                  <td className="tabular px-2 py-2 text-center font-bold">{student.combinedScore}</td>
                  <td className="px-2 py-2 text-center">
                    {student.badges.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <span title={student.badges.map((badge) => badge.name).join("، ")}>
                        {student.badges.map((badge, index) => (
                          <span key={`${badge.name}-${index}`}>{badge.icon}</span>
                        ))}
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {data.unmatchedCount > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {data.unmatchedCount} طالباً من نظام المعلّم لم يُطابَقوا بسجلّات الجامع (المطابقة بالاسم المُطبَّع) —
            تظهر درجتهم من التفاعل وحده.
          </p>
        )}
      </Card>
    </div>
  );
}

/** 0-100 أو null — «75٪» أو «—» */
function formatPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value)}٪`;
}

/** نسبة 0-1 أو null — «80٪» أو «—» */
function formatRatio(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}٪`;
}
