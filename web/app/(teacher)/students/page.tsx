"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { pageCount, studentJuzes } from "@/lib/pairing";
import { juzLabel, juzToPages } from "@/lib/quran";
import { useStudents } from "@/lib/store";
import type { Student } from "@/lib/types";

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

  const loadUsernames = useCallback(() => {
    fetch("/api/students/credentials")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { usernames?: Record<string, string> } | null) => {
        if (data?.usernames) setUsernames(data.usernames);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadUsernames();
  }, [loadUsernames]);

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
    );
  }

  return (
    <div className="space-y-4">
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

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-right text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">الاسم</th>
              <th className="px-3 py-2 font-medium">المجموعة</th>
              <th className="px-3 py-2 font-medium">المحفوظ</th>
              <th className="px-3 py-2 font-medium">النطاق</th>
              <th className="px-3 py-2 font-medium">الإتقان</th>
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
                  <td className="no-print px-3 py-2 text-left">
                    <button
                      onClick={() => setCredentialFor(student)}
                      className="cursor-pointer rounded px-2 py-1 text-xs text-primary transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {usernames[student.id] ? "الحساب" : "إنشاء حساب"}
                    </button>
                    <button
                      onClick={() => remove(student.id)}
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
