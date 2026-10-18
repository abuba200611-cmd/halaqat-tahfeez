"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge as UiBadge, Button, Card, Empty, Stat } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import {
  CERTIFICATE_KIND_LABELS,
  ERROR_KINDS,
  ERROR_LABELS,
  NOMINATION_STATUS_LABELS,
  juzRangeLabel,
  type CertificateKind,
  type ErrorKind,
  type ExamConfig,
  type NominationStatus,
} from "@/lib/mosque/exams";
import { PERIOD_CHOICES, type PeriodChoice, type ReportPeriod } from "@/lib/mosque/report-periods";

/*
  لوحة الاختبارات والشهادات للإدارة — تبويبات: الأنواع، الترشيحات والجدولة،
  الجلسات، النتائج، الشهادات، التقارير، والإعدادات (كل رقم قابل للضبط).
*/

type ExamTypeView = {
  id: number;
  name: string;
  juzCount: number;
  maxScore: number;
  passMark: number;
  errorRules: Partial<Record<ErrorKind, number>>;
  active: boolean;
};
type NominationView = {
  id: number;
  typeId: number;
  typeName: string;
  studentName: string;
  halaqahName: string;
  juzFrom: number;
  juzTo: number;
  status: NominationStatus;
  sessionId: number | null;
  nominatedByName: string;
  note: string;
  createdAt: string;
};
type SessionView = {
  id: number;
  typeId: number;
  typeName: string;
  sessionDate: string;
  location: string;
  notes: string;
  status: "scheduled" | "closed";
  committee: { kind: "teacher" | "member"; id: number; name: string }[];
  scheduledCount: number;
  recordedCount: number;
  publishedCount: number;
};
type ResultView = {
  id: number;
  studentName: string;
  halaqahName: string;
  typeName: string;
  juzFrom: number;
  juzTo: number;
  score: number;
  maxScore: number;
  passMark: number;
  passed: boolean;
  publishedAt: string | null;
  sessionDate: string;
  examinerName: string;
};
type CertificateView = {
  id: number;
  code: string;
  kind: CertificateKind;
  holderName: string;
  title: string;
  issuedAt: string;
  revokedAt: string | null;
};
type ExamsData = {
  config: ExamConfig;
  types: ExamTypeView[];
  nominations: NominationView[];
  sessions: SessionView[];
  recentResults: ResultView[];
  certificates: CertificateView[];
  teachers: { id: number; name: string }[];
  members: { id: number; name: string }[];
  halaqahs: { id: number; name: string }[];
};

const TABS = ["الأنواع", "الترشيحات والجدولة", "الجلسات", "النتائج", "الشهادات", "التقارير", "الإعدادات"] as const;
type Tab = (typeof TABS)[number];

/** الاختبارات والشهادات — مركز إدارة الجامع لها */
export default function ExamsPage() {
  const { id } = useParams<{ id: string }>();
  const mosqueId = Number(id);
  const [tab, setTab] = useState<Tab>("الأنواع");
  const base = `/api/mosques/${mosqueId}/exams`;
  const { data, status, loading, reload } = useApi<ExamsData>(base);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/exams`} title="الاختبارات والشهادات">
      {!data ? (
        <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الاختبارات والشهادات" />
      ) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="أنواع الاختبارات" value={String(data.types.length)} />
            <Stat label="ترشيحات بانتظار الجدولة" value={String(data.nominations.filter((n) => n.status === "pending").length)} />
            <Stat label="جلسات" value={String(data.sessions.length)} />
            <Stat label="شهادات صادرة" value={String(data.certificates.filter((c) => !c.revokedAt).length)} />
          </div>

          <div className="flex gap-1 overflow-x-auto rounded-full bg-muted p-1 sm:w-fit">
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={`shrink-0 cursor-pointer rounded-full px-4 py-1.5 text-sm transition-colors duration-200 ${
                  tab === value ? "bg-surface font-semibold shadow-sm" : "text-muted-foreground"
                }`}
              >
                {value}
              </button>
            ))}
          </div>

          {tab === "الأنواع" && <TypesTab mosqueId={mosqueId} data={data} onSaved={reload} />}
          {tab === "الترشيحات والجدولة" && <NominationsTab mosqueId={mosqueId} data={data} onSaved={reload} />}
          {tab === "الجلسات" && <SessionsTab mosqueId={mosqueId} data={data} onSaved={reload} />}
          {tab === "النتائج" && <ResultsTab mosqueId={mosqueId} data={data} onSaved={reload} />}
          {tab === "الشهادات" && <CertificatesTab mosqueId={mosqueId} data={data} onSaved={reload} />}
          {tab === "التقارير" && <ReportsTab mosqueId={mosqueId} />}
          {tab === "الإعدادات" && <SettingsTab mosqueId={mosqueId} config={data.config} onSaved={reload} />}
        </div>
      )}
    </MosquePage>
  );
}

// ————— الأنواع —————

function TypesTab({ mosqueId, data, onSaved }: { mosqueId: number; data: ExamsData; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [juzCount, setJuzCount] = useState("1");
  const [maxScore, setMaxScore] = useState(String(data.config.maxScore));
  const [passMark, setPassMark] = useState(String(data.config.passMark));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await callApi(`/api/mosques/${mosqueId}/exams/types`, "POST", {
      name,
      juzCount: Number(juzCount),
      maxScore: Number(maxScore),
      passMark: Number(passMark),
    });
    setBusy(false);
    if (!result.ok) setError(result.error);
    else {
      setName("");
      onSaved();
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">نوع اختبار جديد</h3>
        <form onSubmit={create} className="grid gap-3 sm:grid-cols-5 sm:items-end">
          <label className="block text-xs text-muted-foreground sm:col-span-2">
            الاسم
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} required placeholder="مثال: اختبار ثلاثة أجزاء" className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-xs text-muted-foreground">
            عدد الأجزاء
            <input type="number" min={1} max={30} value={juzCount} onChange={(e) => setJuzCount(e.target.value)} className={`${inputClass} tabular mt-1`} />
          </label>
          <label className="block text-xs text-muted-foreground">
            الدرجة العظمى
            <input type="number" min={1} max={data.config.maxScoreCap} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} className={`${inputClass} tabular mt-1`} />
          </label>
          <label className="block text-xs text-muted-foreground">
            درجة النجاح
            <input type="number" min={1} max={data.config.maxScoreCap} value={passMark} onChange={(e) => setPassMark(e.target.value)} className={`${inputClass} tabular mt-1`} />
          </label>
          <div className="sm:col-span-5">
            <Button type="submit" disabled={busy || !name.trim()}>
              إضافة النوع
            </Button>
          </div>
        </form>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {data.types.length === 0 ? (
        <Empty title="لا أنواع بعد." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.types.map((type) => (
            <TypeCard key={type.id} mosqueId={mosqueId} type={type} config={data.config} onSaved={onSaved} />
          ))}
        </div>
      )}
    </div>
  );
}

function TypeCard({
  mosqueId,
  type,
  config,
  onSaved,
}: {
  mosqueId: number;
  type: ExamTypeView;
  config: ExamConfig;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const kind of ERROR_KINDS) initial[kind] = String(type.errorRules[kind] ?? config.deductions[kind]);
    return initial;
  });

  async function patch(changes: Record<string, unknown>) {
    setError(null);
    const result = await callApi(`/api/mosques/${mosqueId}/exams/types/${type.id}`, "PATCH", changes);
    if (!result.ok) setError(result.error);
    else onSaved();
  }

  async function saveRules() {
    const errorRules: Record<string, number> = {};
    for (const kind of ERROR_KINDS) {
      const value = Number(rules[kind]);
      if (Number.isInteger(value) && value >= 0) errorRules[kind] = value;
    }
    await patch({ errorRules });
  }

  async function remove() {
    if (!window.confirm(`حذف «${type.name}»؟ تُحذف ترشيحاته ونتائجه معه.`)) return;
    const result = await callApi(`/api/mosques/${mosqueId}/exams/types/${type.id}`, "DELETE");
    if (!result.ok) setError(result.error);
    else onSaved();
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{type.name}</p>
          <p className="text-xs text-muted-foreground">
            {type.juzCount === 1 ? "جزء واحد" : `${type.juzCount} أجزاء`} • النجاح عند {type.passMark} من {type.maxScore}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <UiBadge tone={type.active ? "good" : "warn"}>{type.active ? "مفعّل" : "موقوف"}</UiBadge>
          <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => patch({ active: !type.active })}>
            {type.active ? "إيقاف" : "تفعيل"}
          </Button>
          <Button variant="danger" className="!px-3 !py-1 text-xs" onClick={remove}>
            حذف
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ERROR_KINDS.map((kind) => (
          <label key={kind} className="block text-xs text-muted-foreground">
            خصم {ERROR_LABELS[kind]}
            <input
              type="number"
              min={0}
              max={config.maxScoreCap}
              value={rules[kind]}
              onChange={(e) => setRules({ ...rules, [kind]: e.target.value })}
              className={`${inputClass} tabular mt-1`}
            />
          </label>
        ))}
      </div>
      <Button variant="ghost" onClick={saveRules}>
        حفظ قواعد الخصم
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

// ————— الترشيحات والجدولة —————

function NominationsTab({ mosqueId, data, onSaved }: { mosqueId: number; data: ExamsData; onSaved: () => void }) {
  const pending = data.nominations.filter((n) => n.status === "pending");
  const rest = data.nominations.filter((n) => n.status !== "pending");

  async function withdraw(nomination: NominationView) {
    if (!window.confirm(`سحب ترشيح ${nomination.studentName}؟`)) return;
    const result = await callApi(`/api/mosques/${mosqueId}/exams/nominations/${nomination.id}`, "DELETE");
    if (result.ok) onSaved();
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h3 className="mb-3 font-semibold">ترشيحات بانتظار الجدولة ({pending.length})</h3>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            لا ترشيحات معلّقة. يرشّح المعلّمون طلابهم من تطبيقهم فتظهر هنا.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {pending.map((nomination) => (
              <li key={nomination.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-sm">
                  <span className="font-medium">{nomination.studentName}</span>
                  <span className="mx-1 text-muted-foreground">•</span>
                  {nomination.typeName} ({juzRangeLabel(nomination.juzFrom, nomination.juzTo)})
                  <span className="mx-1 text-muted-foreground">•</span>
                  حلقة {nomination.halaqahName}
                  <span className="ms-2 text-xs text-muted-foreground">رشّحه {nomination.nominatedByName}</span>
                </span>
                <Button variant="danger" className="!px-3 !py-1 text-xs" onClick={() => withdraw(nomination)}>
                  سحب
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">جدولة الترشيحات تكون من تبويب الجلسات — أنشئ جلسة واختر كشفها.</p>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-semibold">سجل الترشيحات</h3>
        {rest.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا سجل بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rest.map((nomination) => (
              <li key={nomination.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm">
                  <span className="font-medium">{nomination.studentName}</span>
                  <span className="mx-1 text-muted-foreground">•</span>
                  {nomination.typeName} ({juzRangeLabel(nomination.juzFrom, nomination.juzTo)})
                </span>
                <UiBadge tone={nomination.status === "done" ? "good" : nomination.status === "withdrawn" ? "warn" : "neutral"}>
                  {NOMINATION_STATUS_LABELS[nomination.status]}
                </UiBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ————— الجلسات —————

function SessionsTab({ mosqueId, data, onSaved }: { mosqueId: number; data: ExamsData; onSaved: () => void }) {
  const activeTypes = data.types.filter((t) => t.active);
  const [typeId, setTypeId] = useState(String(activeTypes[0]?.id ?? ""));
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openSession, setOpenSession] = useState<number | null>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await callApi<{ session: SessionView }>(`/api/mosques/${mosqueId}/exams/sessions`, "POST", {
      typeId: Number(typeId),
      sessionDate,
      location,
      notes,
    });
    setBusy(false);
    if (!result.ok) setError(result.error);
    else {
      setLocation("");
      setNotes("");
      setOpenSession(result.data?.session.id ?? null);
      onSaved();
    }
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">جلسة اختبار جديدة</h3>
        {activeTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">فعّل نوع اختبار أولاً من تبويب الأنواع.</p>
        ) : (
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <label className="block text-xs text-muted-foreground">
              النوع
              <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className={`${inputClass} mt-1`}>
                {activeTypes.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-muted-foreground">
              التاريخ
              <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} className={`${inputClass} tabular mt-1`} />
            </label>
            <label className="block text-xs text-muted-foreground">
              المقر (اختياري)
              <input value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} className={`${inputClass} mt-1`} />
            </label>
            <label className="block text-xs text-muted-foreground">
              ملاحظات (اختياري)
              <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className={`${inputClass} mt-1`} />
            </label>
            <div className="sm:col-span-4">
              <Button type="submit" disabled={busy}>
                إنشاء الجلسة
              </Button>
            </div>
          </form>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      {data.sessions.length === 0 ? (
        <Empty title="لا جلسات بعد." />
      ) : (
        <div className="space-y-3">
          {data.sessions.map((session) => (
            <SessionCard
              key={session.id}
              mosqueId={mosqueId}
              session={session}
              data={data}
              open={openSession === session.id}
              onToggle={() => setOpenSession(openSession === session.id ? null : session.id)}
              onSaved={onSaved}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({
  mosqueId,
  session,
  data,
  open,
  onToggle,
  onSaved,
}: {
  mosqueId: number;
  session: SessionView;
  data: ExamsData;
  open: boolean;
  onToggle: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [committee, setCommittee] = useState(session.committee);
  const [teacherPick, setTeacherPick] = useState("");
  const [memberPick, setMemberPick] = useState("");
  const [roster, setRoster] = useState<number[]>(() =>
    data.nominations.filter((n) => n.sessionId === session.id && (n.status === "scheduled" || n.status === "done")).map((n) => n.id),
  );

  const candidates = data.nominations.filter(
    (n) => n.typeId === session.typeId && (n.status === "pending" || (n.sessionId === session.id && n.status !== "withdrawn")),
  );

  async function patch(changes: Record<string, unknown>) {
    setError(null);
    const result = await callApi(`/api/mosques/${mosqueId}/exams/sessions/${session.id}`, "PATCH", changes);
    if (!result.ok) setError(result.error);
    else onSaved();
  }

  function addCommittee(kind: "teacher" | "member", id: string) {
    if (!id) return;
    const numeric = Number(id);
    if (committee.some((m) => m.kind === kind && m.id === numeric)) return;
    const name = (kind === "teacher" ? data.teachers : data.members).find((x) => x.id === numeric)?.name ?? "";
    setCommittee([...committee, { kind, id: numeric, name }]);
    if (kind === "teacher") setTeacherPick("");
    else setMemberPick("");
  }

  return (
    <Card className="p-4">
      <button type="button" onClick={onToggle} className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-2 text-start">
        <span className="text-sm">
          <span className="font-semibold">{session.typeName}</span>
          <span className="mx-1 text-muted-foreground">•</span>
          <span className="tabular">{session.sessionDate}</span>
          {session.location && <span className="text-muted-foreground"> • {session.location}</span>}
          <span className="ms-2 text-xs text-muted-foreground">
            {session.recordedCount} نتيجة ({session.publishedCount} منشورة)
          </span>
        </span>
        <span className="flex items-center gap-2">
          <UiBadge tone={session.status === "scheduled" ? "neutral" : "warn"}>
            {session.status === "scheduled" ? "مفتوحة" : "مغلقة"}
          </UiBadge>
          <span className="text-xs text-muted-foreground">{open ? "إغلاق ▲" : "تفاصيل ▼"}</span>
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">لجنة الامتحان (معلّمو الجامع وأعضاؤه)</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select value={teacherPick} onChange={(e) => addCommittee("teacher", e.target.value)} className={inputClass} aria-label="إضافة معلّم">
                <option value="">+ معلّم…</option>
                {data.teachers
                  .filter((t) => !committee.some((m) => m.kind === "teacher" && m.id === t.id))
                  .map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
              </select>
              <select value={memberPick} onChange={(e) => addCommittee("member", e.target.value)} className={inputClass} aria-label="إضافة عضو">
                <option value="">+ عضو من أعضاء الجامع…</option>
                {data.members
                  .filter((m) => !committee.some((c) => c.kind === "member" && c.id === m.id))
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
              </select>
              <Button onClick={() => patch({ committee })} disabled={unchanged(committee, session.committee)}>
                حفظ اللجنة
              </Button>
            </div>
            {committee.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {committee.map((member) => (
                  <button
                    key={`${member.kind}:${member.id}`}
                    type="button"
                    onClick={() => setCommittee(committee.filter((m) => !(m.kind === member.kind && m.id === member.id)))}
                    className="cursor-pointer rounded-full bg-muted px-3 py-1 text-xs hover:bg-muted/70"
                  >
                    {member.name} ✕
                  </button>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">المعلّم بلجنة الجلسة وحده يرى شاشة التقييم ويُسجّل النتائج.</p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">كشف الجلسة — الترشيحات المؤهَّلة لهذا النوع</p>
            {candidates.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا ترشيحات مؤهَّلة — تظهر هنا الترشيحات المعلّقة من نفس النوع.</p>
            ) : (
              <ul className="space-y-1">
                {candidates.map((nomination) => (
                  <li key={nomination.id}>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={roster.includes(nomination.id)}
                        onChange={(e) =>
                          setRoster(e.target.checked ? [...roster, nomination.id] : roster.filter((id) => id !== nomination.id))
                        }
                      />
                      {nomination.studentName} — حلقة {nomination.halaqahName} ({juzRangeLabel(nomination.juzFrom, nomination.juzTo)})
                      {nomination.status === "done" && <UiBadge tone="good">مسجَّلة نتيجته</UiBadge>}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <Button onClick={() => patch({ nominationIds: roster })} disabled={unchanged(roster, rosterOfSession(data, session.id))}>
              حفظ الكشف
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <Button variant="ghost" onClick={() => patch({ status: session.status === "scheduled" ? "closed" : "scheduled" })}>
              {session.status === "scheduled" ? "إغلاق الجلسة" : "إعادة فتح الجلسة"}
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!window.confirm("حذف الجلسة؟ الترشيحات بلا نتائج تعود بانتظار الجدولة.")) return;
                const result = await callApi(`/api/mosques/${mosqueId}/exams/sessions/${session.id}`, "DELETE");
                if (!result.ok) setError(result.error);
                else onSaved();
              }}
            >
              حذف الجلسة
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      )}
    </Card>
  );
}

function rosterOfSession(data: ExamsData, sessionId: number): number[] {
  return data.nominations.filter((n) => n.sessionId === sessionId && (n.status === "scheduled" || n.status === "done")).map((n) => n.id);
}

/** زرّا الحفظ يُعطّلان ما دام لا تغيير عن المحفوظ — مقارنة قيم بسيطة */
function unchanged(next: unknown, saved: unknown): boolean {
  return JSON.stringify(next) === JSON.stringify(saved);
}

// ————— النتائج —————

function ResultsTab({ mosqueId, data, onSaved }: { mosqueId: number; data: ExamsData; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  async function setPublished(result: ResultView, published: boolean) {
    setError(null);
    const outcome = await callApi(`/api/mosques/${mosqueId}/exams/results/${result.id}`, "PATCH", { published });
    if (!outcome.ok) setError(outcome.error);
    else onSaved();
  }

  async function issueCertificate(result: ResultView) {
    setError(null);
    setIssued(null);
    const outcome = await callApi<{ certificate: CertificateView }>(`/api/mosques/${mosqueId}/exams/certificates`, "POST", {
      kind: "student_exam",
      resultId: result.id,
    });
    if (!outcome.ok) setError(outcome.error);
    else {
      setIssued(`أُصدرت شهادة ${result.studentName} — رمزها ${outcome.data?.certificate.code}`);
      onSaved();
    }
  }

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-semibold">النتائج ({data.recentResults.length})</h3>
      {data.recentResults.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا نتائج بعد — تُسجَّل من شاشة تقييم الممتحنين.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.recentResults.map((result) => (
            <li key={result.id} className="space-y-1.5 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm">
                  <span className="font-medium">{result.studentName}</span>
                  <span className="mx-1 text-muted-foreground">•</span>
                  {result.typeName} ({juzRangeLabel(result.juzFrom, result.juzTo)})
                  <span className="mx-1 text-muted-foreground">•</span>
                  <span className="tabular">
                    {result.score}/{result.maxScore}
                  </span>
                  <span className="ms-2 text-xs text-muted-foreground">الممتحن {result.examinerName}</span>
                </span>
                <span className="flex items-center gap-2">
                  <UiBadge tone={result.passed ? "good" : "warn"}>{result.passed ? "ناجح" : "لم يُجتز"}</UiBadge>
                  <UiBadge tone={result.publishedAt ? "good" : "neutral"}>{result.publishedAt ? "منشورة" : "مسوّدة"}</UiBadge>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.publishedAt ? (
                  <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => setPublished(result, false)}>
                    سحب النشر
                  </Button>
                ) : (
                  <Button className="!px-3 !py-1 text-xs" onClick={() => setPublished(result, true)}>
                    نشر النتيجة
                  </Button>
                )}
                {result.passed && result.publishedAt && (
                  <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => issueCertificate(result)}>
                    إصدار شهادة إنجاز
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {issued && <p className="mt-3 text-sm text-success">{issued}</p>}
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

// ————— الشهادات —————

function CertificatesTab({
  mosqueId,
  data,
  onSaved,
}: {
  mosqueId: number;
  data: ExamsData;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<CertificateKind>("teacher_service");
  const [holderName, setHolderName] = useState("");
  const [title, setTitle] = useState("");
  const [period, setPeriod] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);

  async function issue(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setIssued(null);
    const result = await callApi<{ certificate: CertificateView }>(`/api/mosques/${mosqueId}/exams/certificates`, "POST", {
      kind,
      holderName,
      ...(title ? { title } : {}),
      ...(kind !== "student_exam" ? { payload: period ? { period } : {} } : {}),
    });
    setBusy(false);
    if (!result.ok) setError(result.error);
    else {
      setIssued(`أُصدرت شهادة ${holderName} — رمزها ${result.data?.certificate.code}`);
      setHolderName("");
      setTitle("");
      setPeriod("");
      onSaved();
    }
  }

  async function revoke(certificate: CertificateView, revoked: boolean) {
    const result = await callApi(`/api/mosques/${mosqueId}/exams/certificates/${certificate.id}`, "PATCH", { revoked });
    if (!result.ok) setError(result.error);
    else onSaved();
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="font-semibold">إصدار شهادة خدمة أو تعريف</h3>
        <p className="text-xs text-muted-foreground">شهادات الإنجاز تُصدر من تبويب النتائج على النتائج الناجحة المنشورة.</p>
        <form onSubmit={issue} className="grid gap-3 sm:grid-cols-2 sm:items-end">
          <label className="block text-xs text-muted-foreground">
            النوع
            <select value={kind} onChange={(e) => setKind(e.target.value as CertificateKind)} className={`${inputClass} mt-1`}>
              <option value="teacher_service">شهادة خدمة معلّم</option>
              <option value="student_enrollment">تعريف طالب</option>
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            اسم الحامل
            <input value={holderName} onChange={(e) => setHolderName(e.target.value)} maxLength={150} required className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-xs text-muted-foreground">
            العنوان (اختياري — يُشتق تلقائياً إن تُرك فارغاً)
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={`${inputClass} mt-1`} />
          </label>
          <label className="block text-xs text-muted-foreground">
            {kind === "teacher_service" ? "فترة الخدمة (اختياري)" : "السنة الدراسية (اختياري)"}
            <input value={period} onChange={(e) => setPeriod(e.target.value)} maxLength={200} placeholder={kind === "teacher_service" ? "مثال: 1446–1448 هـ" : "مثال: 1448 هـ"} className={`${inputClass} mt-1`} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={busy || !holderName.trim()}>
              إصدار الشهادة
            </Button>
          </div>
        </form>
        {issued && <p className="text-sm text-success">{issued}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-semibold">الشهادات الصادرة ({data.certificates.length})</h3>
        {data.certificates.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا شهادات بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.certificates.map((certificate) => (
              <li key={certificate.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-sm">
                  <span className="font-medium">{certificate.holderName}</span>
                  <UiBadge>{CERTIFICATE_KIND_LABELS[certificate.kind]}</UiBadge>
                  <span className="ms-2 text-xs text-muted-foreground">{certificate.title}</span>
                  <span className="tabular ms-2 text-xs text-muted-foreground">{certificate.issuedAt}</span>
                  {certificate.revokedAt && <UiBadge tone="warn">مسحوبة</UiBadge>}
                </span>
                <span className="flex items-center gap-2">
                  <Link
                    href={`/verify/${certificate.code}`}
                    className="rounded-lg border border-border px-2 py-1 text-xs text-accent-ink hover:underline"
                    target="_blank"
                  >
                    رابط التحقق: {certificate.code}
                  </Link>
                  <Link
                    href={`/mosque/${mosqueId}/exams/certificates/${certificate.id}/print`}
                    className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary hover:opacity-90"
                    target="_blank"
                  >
                    طباعة
                  </Link>
                  <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => revoke(certificate, !certificate.revokedAt)}>
                    {certificate.revokedAt ? "إعادة" : "سحب"}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ————— التقارير —————

type ReportsData = {
  period: ReportPeriod;
  periodLabel: string;
  stats: {
    totals: { sessions: number; results: number; passed: number; passRate: number | null };
    byHalaqah: { halaqahId: number; name: string; teacherName: string; results: number; passed: number }[];
    byTeacher: { teacherId: number; name: string; nominated: number; results: number; passed: number }[];
    byType: { typeId: number; name: string; results: number; passed: number }[];
  };
};

function ReportsTab({ mosqueId }: { mosqueId: number }) {
  const [period, setPeriod] = useState<PeriodChoice>("hijri_month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const url =
    period === "custom" && from && to
      ? `/api/mosques/${mosqueId}/exams/reports?period=custom&from=${from}&to=${to}`
      : `/api/mosques/${mosqueId}/exams/reports?period=${period}`;
  const { data, loading, status } = useApi<ReportsData>(url);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-muted-foreground">
          الفترة
          <select value={period} onChange={(e) => setPeriod(e.target.value as PeriodChoice)} className={`${inputClass} mt-1`}>
            {PERIOD_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>
        {period === "custom" && (
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
      </div>

      {loading || !data ? (
        <p className="text-sm text-muted-foreground">{status === 400 ? "نطاق التاريخ غير صحيح." : "جارٍ التحميل…"}</p>
      ) : (
        <div className="space-y-5">
          <p className="text-sm font-semibold">{data.periodLabel}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="جلسات الفترة" value={String(data.stats.totals.sessions)} />
            <Stat label="نتائج" value={String(data.stats.totals.results)} />
            <Stat label="ناجحة" value={String(data.stats.totals.passed)} />
            <Stat label="نسبة النجاح" value={data.stats.totals.passRate === null ? "—" : `${data.stats.totals.passRate}٪`} />
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">حسب الحلقة</h4>
            {data.stats.byHalaqah.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا نتائج بالفترة.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border text-start">
                    <th className="py-1.5 text-start">الحلقة</th>
                    <th className="py-1.5 text-start">المعلّمون</th>
                    <th className="py-1.5 text-start">نتائج</th>
                    <th className="py-1.5 text-start">ناجحة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.byHalaqah.map((row) => (
                    <tr key={row.halaqahId} className="border-b border-border/50">
                      <td className="py-1.5">{row.name}</td>
                      <td className="py-1.5 text-muted-foreground">{row.teacherName}</td>
                      <td className="tabular py-1.5">{row.results}</td>
                      <td className="tabular py-1.5">{row.passed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold">إنتاجية المعلّمين (ترشيحات الفترة ونتائجها)</h4>
            {data.stats.byTeacher.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا ترشيحات بالفترة.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-1.5 text-start">المعلّم</th>
                    <th className="py-1.5 text-start">ترشيحات</th>
                    <th className="py-1.5 text-start">نتائج</th>
                    <th className="py-1.5 text-start">ناجحة</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.byTeacher.map((row) => (
                    <tr key={row.teacherId} className="border-b border-border/50">
                      <td className="py-1.5">{row.name}</td>
                      <td className="tabular py-1.5">{row.nominated}</td>
                      <td className="tabular py-1.5">{row.results}</td>
                      <td className="tabular py-1.5">{row.passed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ————— الإعدادات —————

function SettingsTab({ mosqueId, config, onSaved }: { mosqueId: number; config: ExamConfig; onSaved: () => void }) {
  const [maxScore, setMaxScore] = useState(String(config.maxScore));
  const [passMark, setPassMark] = useState(String(config.passMark));
  const [deductions, setDeductions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const kind of ERROR_KINDS) initial[kind] = String(config.deductions[kind]);
    return initial;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await callApi<{ config: ExamConfig }>(`/api/mosques/${mosqueId}/exams`, "PATCH", {
      config: {
        maxScore: Number(maxScore),
        passMark: Number(passMark),
        deductions: Object.fromEntries(ERROR_KINDS.map((kind) => [kind, Number(deductions[kind])])),
      },
    });
    setBusy(false);
    if (!result.ok) setError(result.error);
    else {
      setSaved(true);
      onSaved();
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <h3 className="font-semibold">إعدادات أرقام الاختبارات</h3>
      <p className="text-xs text-muted-foreground">
        كل جامع يختلف عن غيره — هذه الافتراضيات تنطبق على الأنواع الجديدة وخصومات الأخطاء لمن لم يضبط قواعده الخاصة.
      </p>
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          الدرجة العظمى الافتراضية
          <input type="number" min={1} max={config.maxScoreCap} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} className={`${inputClass} tabular mt-1`} />
        </label>
        <label className="block text-xs text-muted-foreground">
          درجة النجاح الافتراضية
          <input type="number" min={1} max={config.maxScoreCap} value={passMark} onChange={(e) => setPassMark(e.target.value)} className={`${inputClass} tabular mt-1`} />
        </label>
        {ERROR_KINDS.map((kind) => (
          <label key={kind} className="block text-xs text-muted-foreground">
            خصم {ERROR_LABELS[kind]} (افتراضي)
            <input
              type="number"
              min={0}
              max={config.maxScoreCap}
              value={deductions[kind]}
              onChange={(e) => setDeductions({ ...deductions, [kind]: e.target.value })}
              className={`${inputClass} tabular mt-1`}
            />
          </label>
        ))}
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>
            حفظ الإعدادات
          </Button>
        </div>
      </form>
      {saved && <p className="text-sm text-success">حُفظت الإعدادات ✓</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}
