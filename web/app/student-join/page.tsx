"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthCard, AuthShell } from "@/components/auth-shell";
import { UserIcon } from "@/components/icons";

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
    <PageShell title="انضمام طالب جديد" subtitle="سجّل بحساب جوجل، ثم أدخل رمز دعوة حلقتك لإنشاء حسابك.">
      {initialError && <p className="mb-3 text-center text-sm text-red-400">{initialError}</p>}
      <a
        href="/api/student-auth/google/start"
        className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold text-white shadow-lg transition-shadow duration-200 hover:shadow-orange-500/40 hover:shadow-xl"
        style={{ background: "linear-gradient(90deg, #F97316, #EF4444)" }}
      >
        الدخول بحساب جوجل
      </a>
      <p className="mt-4 text-center text-xs text-white/60">
        لديك حساب مسبقاً؟{" "}
        <Link href="/student" className="font-semibold text-white hover:underline">
          سجّل دخولك من هنا
        </Link>
      </p>
    </PageShell>
  );
}

function AlreadyLinked() {
  return (
    <PageShell title="الحساب مرتبط مسبقاً">
      <p className="text-center text-sm text-white/80">
        حساب جوجل هذا مرتبط بطالب مسجّل عندنا بالفعل. استخدم تسجيل الدخول العادي (اسم المستخدم وكلمة المرور
        اللذين أعطاك إياهما معلّمك).
      </p>
      <Link href="/student" className="mt-4 block text-center text-sm font-semibold text-white hover:underline">
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
    "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 pr-11 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10";

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
    <PageShell title="أكمل بيانات الانضمام" subtitle="تم التحقق من حساب جوجل بنجاح. أدخل اسمك ورمز دعوة حلقتك لإتمام إنشاء حسابك.">
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm">
          <span className="text-xs text-white/60">اسمك</span>
          <div className="relative">
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} required className={field} />
            <UserIcon size={18} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          </div>
        </label>
        <label className="block text-sm">
          <span className="text-xs text-white/60">رمز دعوة الحلقة</span>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
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
          {busy ? "لحظة…" : "إنشاء حسابي"}
        </button>
      </form>
    </PageShell>
  );
}
