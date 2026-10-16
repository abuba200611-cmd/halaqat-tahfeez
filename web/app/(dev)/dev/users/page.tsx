"use client";

import { useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

type AccountActivity = { lastLoginAt: string | null; lastSeenAt: string | null };

type User =
  | { kind: "teacher"; id: number; label: string; email: string; role: string; halaqah: string; mosque: string | null; active: boolean } & AccountActivity
  | { kind: "student"; halaqahId: number; id: string; label: string; username: string | null; halaqah: string; mosque: string | null; active: boolean } & AccountActivity
  | { kind: "parent"; id: number; label: string; email: string; children: { halaqahId: number; studentId: string; studentName: string }[] } & AccountActivity
  | { kind: "mosque_admin"; id: number; label: string; username: string; mosque: string } & AccountActivity;

type Overview = {
  newAccounts: { days: 7 | 30; teacher: number; student: number; parent: number; mosque_admin: number }[];
  active7d: { teacher: number; student: number; parent: number; mosque_admin: number };
};

const KIND_LABEL: Record<User["kind"], string> = {
  teacher: "معلّم",
  student: "طالب",
  parent: "ولي أمر",
  mosque_admin: "مدير جامع",
};

/** توقيت النشاط بصيغة قصيرة — أو شرطة إن لم يدخل الحساب قط */
function when(at: string | null): string {
  return at ? at.slice(0, 16).replace("T", " ") : "—";
}

export default function DevUsersPage() {
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<User[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/dev/accounts")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Overview | null) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setHint(null);
    try {
      const res = await fetch(`/api/dev/users?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { users?: User[]; hint?: string; error?: string };
      setUsers(data.users ?? []);
      setHint(data.hint ?? data.error ?? null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-naskh text-2xl font-bold">المستخدمون</h1>
        <p className="text-sm text-muted-foreground">
          بحث موحّد بالاسم أو البريد أو اسم المستخدم — معلّمون وطلاب وأولياء أمور ومدراء جوامع.
        </p>
      </div>

      {overview && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">الحسابات — جديد بآخر ٧/٣٠ يوماً ونشط بآخر ٧ أيام</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-125 text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-2 text-right font-normal">الدور</th>
                  <th className="py-2 text-right font-normal">جديد ٧ أيام</th>
                  <th className="py-2 text-right font-normal">جديد ٣٠ يوماً</th>
                  <th className="py-2 text-right font-normal">نشط ٧ أيام</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(KIND_LABEL) as User["kind"][]).map((kind) => {
                  const byDays = (days: 7 | 30) => overview.newAccounts.find((n) => n.days === days)?.[kind] ?? 0;
                  return (
                    <tr key={kind} className="border-b border-border last:border-0">
                      <td className="py-2">{KIND_LABEL[kind]}</td>
                      <td className="tabular py-2">{byDays(7)}</td>
                      <td className="tabular py-2">{byDays(30)}</td>
                      <td className="tabular py-2">{overview.active7d[kind]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <form onSubmit={search} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث… (حرفان فأكثر)"
          className="w-full max-w-md rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "…" : "بحث"}
        </Button>
      </form>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}

      {users !== null && users.length === 0 && !hint && (
        <Card className="p-4 text-sm text-muted-foreground">لا نتائج.</Card>
      )}
      {users?.map((user, index) => <UserRow key={`${user.kind}-${index}`} user={user} />)}
    </div>
  );
}

function UserRow({ user }: { user: User }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function call(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "تعذّر التنفيذ");
      else window.alert("تم");
    } finally {
      setBusy(false);
    }
  }

  async function impersonate(kind: "teacher" | "mosque_admin", id: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/dev/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر البدء");
        return;
      }
      window.location.href = kind === "teacher" ? "/" : "/mosque";
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            {user.label}
            <Badge tone="good">{KIND_LABEL[user.kind]}</Badge>
            {user.kind === "teacher" && <Badge>{user.role === "supervisor" ? "مشرف" : "مساعد"}</Badge>}
            {user.kind === "teacher" && !user.active && <Badge tone="warn">موقوف</Badge>}
            {user.kind === "student" && !user.active && <Badge tone="warn">محذوف</Badge>}
          </p>
          <p className="text-xs text-muted-foreground">
            {user.kind === "teacher" && `${user.email} · حلقة: ${user.halaqah}${user.mosque ? ` · ${user.mosque}` : ""}`}
            {user.kind === "student" &&
              `${user.username ? `${user.username} · ` : ""}حلقة: ${user.halaqah}${user.mosque ? ` · ${user.mosque}` : ""}`}
            {user.kind === "parent" && `${user.email}${user.children.length ? ` · ${user.children.length} أبناء` : ""}`}
            {user.kind === "mosque_admin" && `${user.username} · ${user.mosque}`}
          </p>
          <p className="tabular mt-1 text-xs text-muted-foreground" dir="ltr">
            login {when(user.lastLoginAt)} · seen {when(user.lastSeenAt)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {user.kind === "teacher" && (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => call("/api/dev/users/teacher-active", { teacherId: user.id, active: !user.active })}>
                {user.active ? "إيقاف" : "تفعيل"}
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => call("/api/dev/users/revoke-sessions", { kind: "teacher", teacherId: user.id })}>
                إبطال الجلسات
              </Button>
              <Button disabled={busy} onClick={() => impersonate("teacher", user.id)}>
                عرض كـ
              </Button>
            </>
          )}
          {user.kind === "student" && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => call("/api/dev/users/revoke-sessions", { kind: "student", halaqahId: user.halaqahId, studentId: user.id })}
            >
              إبطال الجلسات
            </Button>
          )}
          {user.kind === "parent" && (
            <>
              <Button variant="ghost" disabled={busy} onClick={() => call("/api/dev/users/revoke-sessions", { kind: "parent", parentId: user.id })}>
                إبطال الجلسات
              </Button>
            </>
          )}
          {user.kind === "mosque_admin" && (
            <Button disabled={busy} onClick={() => impersonate("mosque_admin", user.id)}>
              عرض كـ
            </Button>
          )}
        </div>
      </div>

      {user.kind === "parent" && user.children.length > 0 && (
        <ul className="mt-3 divide-y divide-border rounded-md border border-border">
          {user.children.map((child) => (
            <li key={`${child.halaqahId}-${child.studentId}`} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{child.studentName}</span>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  call("/api/dev/users/unlink-parent", {
                    parentId: user.id,
                    halaqahId: child.halaqahId,
                    studentId: child.studentId,
                  })
                }
              >
                فكّ الربط
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
