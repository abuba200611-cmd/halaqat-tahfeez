"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { LinkPanel } from "@/components/link-button";
import { pageCount, studentJuzes } from "@/lib/pairing";
import { juzLabel, juzToPages } from "@/lib/quran";
import { useStudents } from "@/lib/store";
import type { Student } from "@/lib/types";

type DeletedStudent = { id: string; name: string; deletedAt: string };

function avgMastery(student: Student): number {
  const vals = Object.values(student.mastery);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export default function StudentsPage() {
  const { students, loading, upsert, remove, loadDemo } = useStudents();
  const [query, setQuery] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [usernames, setUsernames] = useState<Record<string, string>>({});
  const [credentialFor, setCredentialFor] = useState<Student | null>(null);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [linkSummaries, setLinkSummaries] = useState<Record<string, string>>({});
  const [linkFor, setLinkFor] = useState<Student | null>(null);
  const [deleted, setDeleted] = useState<DeletedStudent[]>([]);

  const loadDeleted = useCallback(() => {
    fetch("/api/students/deleted")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { deleted?: DeletedStudent[] } | null) => {
        if (data?.deleted) setDeleted(data.deleted);
      })
      .catch(() => {});
  }, []);

  async function restoreStudent(id: string) {
    const res = await fetch("/api/students/deleted", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      loadDeleted();
      window.location.reload(); // أبسط طريقة نضمن فيها ظهور الطالب المسترجَع بقائمة useStudents
    }
  }

  const loadUsernames = useCallback(() => {
    fetch("/api/students/credentials")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { usernames?: Record<string, string> } | null) => {
        if (data?.usernames) setUsernames(data.usernames);
      })
      .catch(() => {});
  }, []);

  const loadLinks = useCallback(() => {
    fetch("/api/students/link")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { links?: Record<string, string>; summaries?: Record<string, string> } | null) => {
        if (data?.links) setLinks(data.links);
        if (data?.summaries) setLinkSummaries(data.summaries);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadUsernames();
    loadLinks();
    loadDeleted();
  }, [loadUsernames, loadLinks, loadDeleted]);

  const filtered = useMemo(() => {
    const q = query.trim();
    const list = q ? students.filter((s) => s.name.includes(q) || s.group.includes(q)) : students;
    return [...list].sort((a, b) => pageCount(b) - pageCount(a));
  }, [students, query]);

  if (loading) {
    return <Empty title="جارٍ تحميل الطلاب…" />;
  }

  if (students.length === 0 && !showForm) {
    return (
      <div className="space-y-4">
        <DeletedBanner deleted={deleted} onRestore={restoreStudent} />
        <InviteLinksSection />
        <Empty
          title="القائمة فارغة."
          action={
            <div className="flex gap-2">
              <Button onClick={() => loadDemo(150)}>تحميل حلقة تجريبية</Button>
              <Button variant="ghost" onClick={() => setShowForm(true)}>
                إضافة طالب
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DeletedBanner deleted={deleted} onRestore={restoreStudent} />
      <InviteLinksSection />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-naskh text-2xl font-bold">
          الطلاب <span className="tabular text-base font-normal text-muted-foreground">({students.length})</span>
        </h1>
        <div className="no-print flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث بالاسم أو المجموعة"
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <a
            href="/api/students/export"
            className="flex items-center rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            تصدير CSV
          </a>
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "إغلاق" : "إضافة طالب"}
          </Button>
        </div>
      </div>

      {showForm && <AddStudentForm onAdd={(s) => { upsert(s); setShowForm(false); }} />}

      {credentialFor && (
        <StudentCredentialsForm
          student={credentialFor}
          existingUsername={usernames[credentialFor.id]}
          onClose={() => setCredentialFor(null)}
          onSaved={(username) => {
            setUsernames((prev) => ({ ...prev, [credentialFor.id]: username }));
            setCredentialFor(null);
          }}
        />
      )}

      {linkFor && (
        <LinkPanel
          student={linkFor}
          linkUsername={links[linkFor.id]}
          summaryLabel={linkSummaries[linkFor.id]}
          onClose={() => setLinkFor(null)}
          onLinked={(linkUsername, summaryLabel, updated) => {
            setLinks((prev) => ({ ...prev, [linkFor.id]: linkUsername }));
            setLinkSummaries((prev) => ({ ...prev, [linkFor.id]: summaryLabel }));
            upsert(updated);
            setLinkFor(null);
          }}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-right text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">الاسم</th>
              <th className="px-3 py-2 font-medium">المجموعة</th>
              <th className="px-3 py-2 font-medium">المحفوظ</th>
              <th className="px-3 py-2 font-medium">النطاق</th>
              <th className="px-3 py-2 font-medium">الإتقان</th>
              <th className="no-print px-3 py-2 font-medium">تقييمك</th>
              <th className="no-print px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((student) => {
              const mastery = avgMastery(student);
              return (
                <tr key={student.id} className="transition-colors duration-200 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    {student.name}
                    {usernames[student.id] && (
                      <span className="mr-2">
                        <Badge tone="good">حساب</Badge>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{student.group}</td>
                  <td className="tabular px-3 py-2">{pageCount(student)} ص</td>
                  <td className="px-3 py-2 text-muted-foreground">{juzLabel(studentJuzes(student))}</td>
                  <td className="px-3 py-2">
                    <Badge tone={mastery >= 75 ? "good" : mastery >= 55 ? "neutral" : "warn"}>
                      {mastery}٪
                    </Badge>
                  </td>
                  <td className="no-print px-3 py-2">
                    <StarRating value={student.rating} onChange={(rating) => upsert({ ...student, rating })} />
                  </td>
                  <td className="no-print px-3 py-2 text-left">
                    {usernames[student.id] && (
                      <button
                        onClick={() => setCredentialFor(student)}
                        className="cursor-pointer rounded px-2 py-1 text-xs text-primary transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        الحساب
                      </button>
                    )}
                    <button
                      onClick={() => setLinkFor(student)}
                      className="cursor-pointer rounded px-2 py-1 text-xs text-primary transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {links[student.id] ? "تحديث" : "ربط"}
                    </button>
                    <button
                      onClick={() => {
                        remove(student.id);
                        setTimeout(loadDeleted, 500);
                      }}
                      className="cursor-pointer rounded px-2 py-1 text-xs text-destructive transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {filtered.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">لا نتائج مطابقة للبحث.</p>
      )}
    </div>
  );
}

/**
 * رابط دعوة ثابت لهذه الحلقة — يشاركه المعلّم مع طلابه (قروب واتساب
 * مثلاً)، وكل من يفتحه وينشئ حسابه بنظام تسجيل الورد ينضم فوراً لهذه
 * الحلقة بلا أي إدخال يدوي (لا إضافة طالب، ولا ربط اسم مستخدم).
 */
type TeamMember = { id: number; teacherName: string; username: string; role: "supervisor" | "assistant" };

/** حقل رابط بزر نسخ — نفس الشكل يتكرّر لكل نوع رابط دعوة بالقسم أدناه */
function CopyLinkField({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // بعض المتصفحات تمنع الكتابة للحافظة بلا HTTPS — الرابط ظاهر بالحقل أصلاً
    }
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground"
      />
      <Button onClick={copy} className="shrink-0">
        {copied ? "نُسخ ✓" : "نسخ"}
      </Button>
    </div>
  );
}

/**
 * قسم واحد يجمع كل روابط دعوة الحلقة — بدل ما تكون بطاقات متفرّقة يصعب
 * تمييزها، كل نوع رابط له أيقونة وعنوان واضح يفرّقه عن الثاني فوراً:
 * 🎓 للطلاب (ينضمّون بأنفسهم لتسجيل ورد) مقابل 👥 لمعلّم مساعد (ينضم
 * بصلاحيات مطابقة تماماً لنفس الحلقة).
 */
function InviteLinksSection() {
  const [studentLink, setStudentLink] = useState<string | null>(null);
  const [teacherLink, setTeacherLink] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);

  useEffect(() => {
    fetch("/api/teacher/invite")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { link?: string } | null) => {
        if (data?.link) setStudentLink(data.link);
      })
      .catch(() => {});

    fetch("/api/teacher/invite-colleague")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { link?: string; team?: TeamMember[] } | null) => {
        if (data?.link) setTeacherLink(data.link);
        if (data?.team) setTeam(data.team);
      })
      .catch(() => {});
  }, []);

  if (!studentLink && !teacherLink) return null;

  return (
    <Card className="no-print p-4">
      <h2 className="mb-3 text-sm font-semibold">روابط الدعوة</h2>

      <div className="space-y-4 divide-y divide-border [&>*+*]:pt-4">
        {studentLink && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <span aria-hidden>🎓</span> للطلاب
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              شاركه مع طلابك (بقروب واتساب مثلاً) — كل من يفتحه وينشئ حسابه بتسجيل الورد
              ينضم لحلقتك تلقائياً، بلا ما تحتاج تضيفه أو تربطه يدوياً.
            </p>
            <CopyLinkField link={studentLink} />
          </div>
        )}

        {teacherLink && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <span aria-hidden>👥</span> لمعلّم مساعد
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              رابط مختلف تماماً عن رابط الطلاب أعلاه — من يفتحه وينشئ حسابه ينضم كمساعد مشرف
              لنفس حلقتك (يشوف طلابك ويدير كل شيء بصلاحيات مطابقة لك)، بدل ما ينشئ حلقة جديدة.
            </p>
            <CopyLinkField link={teacherLink} />
            {team.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {team.map((t) => (
                  <li key={t.id}>
                    <Badge tone={t.role === "supervisor" ? "good" : "neutral"}>
                      {t.teacherName || t.username} — {t.role === "supervisor" ? "مشرف" : "مساعد"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function AddStudentForm({ onAdd }: { onAdd: (student: Student) => void }) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("المجموعة الأولى");
  const [fromJuz, setFromJuz] = useState(30);
  const [toJuz, setToJuz] = useState(30);
  const [mastery, setMastery] = useState(70);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    const { from, to } = juzToPages(fromJuz, toJuz);
    const masteryMap: Record<number, number> = {};
    for (let j = Math.min(fromJuz, toJuz); j <= Math.max(fromJuz, toJuz); j++) {
      masteryMap[j] = mastery;
    }

    onAdd({
      id: `s${Date.now()}`,
      name: name.trim(),
      group,
      ranges: [{ from, to, monthsAgo: 6 }],
      mastery: masteryMap,
      active: true,
      rating: 0,
    });
    setName("");
  }

  return (
    <Card className="no-print p-4">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="الاسم">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </Field>
        <Field label="المجموعة">
          <input
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </Field>
        <Field label="من جزء">
          <NumberInput value={fromJuz} onChange={setFromJuz} min={1} max={30} />
        </Field>
        <Field label="إلى جزء">
          <NumberInput value={toJuz} onChange={setToJuz} min={1} max={30} />
        </Field>
        <Field label={`الإتقان: ${mastery}٪`}>
          <input
            type="range"
            min={20}
            max={98}
            value={mastery}
            onChange={(e) => setMastery(Number(e.target.value))}
            className="w-full cursor-pointer accent-primary"
          />
        </Field>
        <div className="lg:col-span-5">
          <Button type="submit">حفظ الطالب</Button>
        </div>
      </form>
    </Card>
  );
}

/**
 * تقييم نجمي خاص بالمعلّم فقط — لا يظهر للطالب في أي واجهة (نظام تسجيل
 * دخوله يستخدم StudentAccount وهو نوع منفصل لا يحمل هذا الحقل أصلاً).
 */
function StarRating({ value, onChange }: { value: number; onChange: (rating: number) => void }) {
  return (
    <div className="flex gap-0.5" title="تقييمك الخاص لهذا الطالب — لا يراه الطالب">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          aria-label={`تقييم ${n} من ٥`}
          className="cursor-pointer text-base leading-none transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <span className={n <= value ? "text-accent" : "text-border"}>★</span>
        </button>
      ))}
    </div>
  );
}

/** شريط تراجع عن الحذف — يظهر بس لو فيه طالب محذوف خلال آخر ٢٤ ساعة */
function DeletedBanner({
  deleted,
  onRestore,
}: {
  deleted: DeletedStudent[];
  onRestore: (id: string) => void;
}) {
  if (deleted.length === 0) return null;
  return (
    <Card className="no-print flex flex-wrap items-center gap-2 border-accent/30 bg-accent/5 p-3">
      <span className="text-sm text-muted-foreground">
        حُذف مؤخراً: {deleted.map((d) => d.name).join("، ")}
      </span>
      <div className="flex flex-wrap gap-1.5">
        {deleted.map((d) => (
          <Button key={d.id} variant="ghost" onClick={() => onRestore(d.id)} className="px-2 py-0.5 text-xs">
            استرجاع {d.name}
          </Button>
        ))}
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/** يمنح طالباً حساب دخول (اسم مستخدم + كلمة مرور) ليسجّل ورده بنفسه */
function StudentCredentialsForm({
  student,
  existingUsername,
  onClose,
  onSaved,
}: {
  student: Student;
  existingUsername?: string;
  onClose: () => void;
  onSaved: (username: string) => void;
}) {
  const [username, setUsername] = useState(existingUsername ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/students/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentId: student.id, username: username.trim(), password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر حفظ الحساب");
        return;
      }
      onSaved(username.trim());
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <Card className="no-print p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          حساب دخول الطالب: <span className="font-naskh">{student.name}</span>
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          إغلاق
        </button>
      </div>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="اسم المستخدم">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            minLength={3}
            required
            className={field}
          />
        </Field>
        <Field label={existingUsername ? "كلمة مرور جديدة" : "كلمة المرور"}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            className={field}
          />
        </Field>
        <div className="sm:col-span-2">
          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={busy}>
            {busy ? "لحظة…" : "حفظ الحساب"}
          </Button>
          <p className="mt-2 text-xs text-muted-foreground">
            يفتح الطالب صفحة <span className="tabular">/student</span> ويسجّل الدخول بهذا الحساب
            ليرسل ورده.
          </p>
        </div>
      </form>
    </Card>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="tabular w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    />
  );
}
