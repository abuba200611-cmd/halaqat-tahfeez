"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard, AuthShell } from "@/components/auth-shell";

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

function PageShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <AuthShell>
      <h1 className="mb-1 text-center font-naskh text-3xl font-bold text-white">{title}</h1>
      {subtitle && <p className="mb-6 text-center text-sm text-white/60">{subtitle}</p>}
      <AuthCard>{children}</AuthCard>
    </AuthShell>
  );
}

function StartGoogle({ initialError }: { initialError: string | null }) {
  return (
    <PageShell title="ربط حساب Google" subtitle="لديك رمز ربط من معلّمك؟">
      {initialError && <p className="mb-3 text-center text-sm text-red-400">{initialError}</p>}
      <a
        href="/api/student-auth/google/link/start"
        className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-orange-500/40 hover:shadow-xl"
        style={{ background: "linear-gradient(90deg, #F97316, #EF4444)" }}
      >
        الدخول بحساب Google
      </a>
      <p className="mt-4 text-center text-xs text-white/60">
        لا تملك رمزاً؟ اطلبه من معلّم حلقتك.{" "}
        <Link href="/student" className="font-semibold text-white hover:underline">
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
    <PageShell title="أدخل رمز الربط" subtitle="تم التحقق من حساب Google بنجاح. أدخل رمز الربط الذي أعطاك إياه معلّمك لإتمام ربط حسابك.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="text-xs text-white/60">رمز الربط</span>
          <input
            value={linkCode}
            onChange={(e) => setLinkCode(e.target.value)}
            required
            className="mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10"
          />
        </label>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-orange-500/40 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
          style={{ background: "linear-gradient(90deg, #F97316, #EF4444)" }}
        >
          {busy ? "لحظة…" : "ربط الحساب"}
        </button>
      </form>
    </PageShell>
  );
}
