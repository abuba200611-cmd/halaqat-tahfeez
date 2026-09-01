"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

/*
  صفحة منعزلة عمداً — STEP 6A. لا تظهر داخل student-gate العام ولا في أي
  تنقّل عام؛ تُفتح فقط عبر رابط مباشر يشاركه المعلّم مع طالب جديد فعلاً
  (مثلاً بجانب رابط دعوة الحلقة الحالي). هذا يتفادى ظهور "دخول بجوجل"
  لطالب موجود أكاديمياً بلا حساب جوجل بعد — وهو بالضبط الخطر المكتشف
  في مرحلة التحليل (STEP 6).
*/
export default function StudentJoinPage() {
  return (
    <Suspense>
      <StudentJoinFlow />
    </Suspense>
  );
}

function StudentJoinFlow() {
  const params = useSearchParams();
  const linked = params.get("linked") === "1";
  const step = params.get("step");
  const urlError = params.get("error");

  if (linked) return <AlreadyLinked />;
  if (step === "invite") return <CompleteInviteForm />;
  return <StartGoogle initialError={urlError} />;
}

function PageShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <h1 className="mb-1 text-center font-naskh text-2xl font-bold text-primary">{title}</h1>
      <Card className="mt-5 p-5">{children}</Card>
    </main>
  );
}

function StartGoogle({ initialError }: { initialError: string | null }) {
  return (
    <PageShell title="انضمام طالب جديد">
      <p className="mb-4 text-center text-sm text-muted-foreground">
        سجّل بحساب جوجل، ثم أدخل رمز دعوة حلقتك لإنشاء حسابك.
      </p>
      {initialError && <p className="mb-3 text-center text-sm text-destructive">{initialError}</p>}
      <a href="/api/student-auth/google/start" className="block">
        <Button className="w-full">الدخول بحساب جوجل</Button>
      </a>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        لديك حساب مسبقاً؟{" "}
        <Link href="/student" className="text-primary hover:underline">
          سجّل دخولك من هنا
        </Link>
      </p>
    </PageShell>
  );
}

function AlreadyLinked() {
  return (
    <PageShell title="الحساب مرتبط مسبقاً">
      <p className="text-center text-sm text-foreground">
        حساب جوجل هذا مرتبط بطالب مسجّل عندنا بالفعل. استخدم تسجيل الدخول العادي (اسم المستخدم وكلمة المرور
        اللذين أعطاك إياهما معلّمك).
      </p>
      <Link href="/student" className="mt-4 block text-center text-sm text-primary hover:underline">
        الذهاب لتسجيل الدخول
      </Link>
    </PageShell>
  );
}

function CompleteInviteForm() {
  const router = useRouter();
  const [studentName, setStudentName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field =
    "mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/student-auth/google/complete-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName, inviteCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إنشاء الحساب");
        return;
      }
      router.push("/student");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell title="أكمل بيانات الانضمام">
      <p className="mb-4 text-center text-sm text-muted-foreground">
        تم التحقق من حساب جوجل بنجاح. أدخل اسمك ورمز دعوة حلقتك لإتمام إنشاء حسابك.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">اسمك</span>
          <input
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            required
            className={field}
          />
        </label>
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">رمز دعوة الحلقة</span>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            className={field}
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "لحظة…" : "إنشاء حسابي"}
        </Button>
      </form>
    </PageShell>
  );
}
