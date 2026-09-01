"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button, Card } from "@/components/ui";

/*
  صفحة منعزلة عمداً — STEP 6B. لا تظهر داخل student-gate العام ولا في أي
  تنقّل عام؛ تُفتح فقط عبر رابط مباشر يشاركه المعلّم مع طالب موجود مسبقاً
  بعدما يسلّمه رمز الربط. هذا يتفادى ظهور "دخول بجوجل" لطالب موجود
  أكاديمياً بلا حساب جوجل بعد قبل أن يملك رمز ربط فعلي — بالضبط ما
  اكتُشِف كخطر في مرحلة التحليل (STEP 6).
*/
export default function StudentLinkPage() {
  return (
    <Suspense>
      <StudentLinkFlow />
    </Suspense>
  );
}

function StudentLinkFlow() {
  const params = useSearchParams();
  const step = params.get("step");
  const urlError = params.get("error");

  if (step === "code") return <EnterLinkCodeForm />;
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
    <PageShell title="ربط حساب Google">
      <p className="mb-4 text-center text-sm text-muted-foreground">لديك رمز ربط من معلّمك؟</p>
      {initialError && <p className="mb-3 text-center text-sm text-destructive">{initialError}</p>}
      <a href="/api/student-auth/google/link/start" className="block">
        <Button className="w-full">الدخول بحساب Google</Button>
      </a>
      <p className="mt-4 text-center text-xs text-muted-foreground">
        لا تملك رمزاً؟ اطلبه من معلّم حلقتك.{" "}
        <Link href="/student" className="text-primary hover:underline">
          أو سجّل دخولك من هنا
        </Link>
      </p>
    </PageShell>
  );
}

function EnterLinkCodeForm() {
  const router = useRouter();
  const [linkCode, setLinkCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const field =
    "mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/student-account-link/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkCode }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إتمام الربط");
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
    <PageShell title="أدخل رمز الربط">
      <p className="mb-4 text-center text-sm text-muted-foreground">
        تم التحقق من حساب Google بنجاح. أدخل رمز الربط الذي أعطاك إياه معلّمك لإتمام ربط حسابك.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="text-xs text-muted-foreground">رمز الربط</span>
          <input
            value={linkCode}
            onChange={(e) => setLinkCode(e.target.value)}
            required
            className={field}
          />
        </label>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "لحظة…" : "ربط الحساب"}
        </Button>
      </form>
    </PageShell>
  );
}
