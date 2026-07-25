"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Button, Card } from "./ui";

export type StudentSession = { id: string; name: string; halaqahName: string };

const StudentContext = createContext<StudentSession | null>(null);

/** هوية الطالب الحالي — يقرأها محتوى الصفحة بعد اجتياز البوابة */
export function useStudentSession(): StudentSession | null {
  return useContext(StudentContext);
}

/**
 * يحرس واجهة الطالب: لا يعرض ورده قبل التحقق من جلسته، ويعرض شاشة دخول
 * بسيطة (اسم مستخدم + كلمة مرور) إن لم يكن مسجّلاً. منفصل تماماً عن بوابة المعلّم.
 */
export function StudentGate({ children }: { children: React.ReactNode }) {
  const [student, setStudent] = useState<StudentSession | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/student-auth/me")
      .then((res) => res.json())
      .then((data: { student: StudentSession | null }) => {
        if (!cancelled) setStudent(data.student);
      })
      .catch(() => {
        if (!cancelled) setStudent(null);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/student-auth/logout", { method: "POST" });
    setStudent(null);
  }, []);

  if (checking) {
    return (
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>
      </main>
    );
  }

  if (!student) {
    return <StudentLogin onAuthenticated={setStudent} />;
  }

  return (
    <StudentContext.Provider value={student}>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-md items-center gap-3 px-4 py-3">
          <span className="font-naskh text-lg font-bold text-primary">وردي</span>
          <div className="mr-auto flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{student.name}</span>
            <Button variant="ghost" onClick={logout}>
              خروج
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">{children}</main>
    </StudentContext.Provider>
  );
}

function StudentLogin({ onAuthenticated }: { onAuthenticated: (s: StudentSession) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/student-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { student?: { id: string; name: string }; error?: string };
      if (!res.ok || !data.student) {
        setError(data.error ?? "تعذّر تسجيل الدخول");
        return;
      }
      // نعيد الجلب من /me لأخذ اسم الحلقة كاملاً
      const me = (await fetch("/api/student-auth/me").then((r) => r.json())) as {
        student: StudentSession | null;
      };
      onAuthenticated(me.student ?? { ...data.student, halaqahName: "" });
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-center font-naskh text-2xl font-bold text-primary">وردي</h1>
      <p className="mb-5 text-center text-sm text-muted-foreground">
        سجّل حفظك ومراجعتك، ويصل معلّمك أنك أنجزت ورد اليوم.
      </p>

      <Card className="p-5">
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">اسم المستخدم</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              className={field}
            />
          </label>

          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">كلمة المرور</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className={field}
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "لحظة…" : "دخول"}
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        لا تملك حساباً؟ اطلب من معلّم حلقتك أن ينشئ لك اسم مستخدم وكلمة مرور.
      </p>
    </main>
  );
}
