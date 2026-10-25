"use client";

import { BrandLockup } from "@/components/brand";
import { AuthBackLink } from "@/components/auth-back-link";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@/components/mosque/ui";

export default function AssociationLoginPage() {
  return (
    <Suspense fallback={null}>
      <AssociationLoginInner />
    </Suspense>
  );
}

/** يقرأ ?username= (تعبئة مسبقة من مبدّل الأدوار عند تحويل المستخدم لإثبات كلمة مرور مدير الجمعية) */
function AssociationLoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState(searchParams.get("username") ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestState, setRequestState] = useState<"pending" | "rejected" | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setRequestState(null);
    try {
      const res = await fetch("/api/association/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.status === 429) {
        setError("محاولات كثيرة، حاول لاحقاً");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        if (data.code === "registration_pending") setRequestState("pending");
        else if (data.code === "registration_rejected") setRequestState("rejected");
        setError(data.error ?? "بيانات الدخول غير صحيحة");
        return;
      }
      router.push("/association");
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <AuthBackLink tone="onLight" className="mb-3 self-start" />
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onLight" size={44} href="/welcome" />
      </div>
      <h1 className="font-display mb-1 text-center text-2xl font-bold text-primary">دخول مدير الجمعية</h1>
      <p className="mb-5 text-center text-sm text-muted-foreground">متابعة جوامع الجمعية وتقاريرها المجمّعة</p>
      <Card className="p-5">
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">
            <span className="text-xs text-muted-foreground">اسم المستخدم</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              dir="ltr"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
              dir="ltr"
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>
          {error && requestState ? (
            <p
              role="status"
              className={`rounded-md border px-3 py-2 text-sm leading-[1.8] ${
                requestState === "pending" ? "border-border bg-muted text-foreground" : "border-destructive text-destructive"
              }`}
            >
              {error}
            </p>
          ) : (
            error && <p className="text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "لحظة…" : "دخول"}
          </Button>
        </form>
      </Card>
      <div className="mt-4 space-y-1.5 text-center text-xs text-muted-foreground">
        <p>
          جمعية جديدة؟{" "}
          <Link href="/register-association" className="font-semibold text-accent-ink underline">
            سجّل جمعيتك
          </Link>
        </p>
        <p>
          <Link href="/privacy" className="font-semibold text-accent-ink underline">
            سياسة الخصوصية
          </Link>
        </p>
      </div>
    </main>
  );
}
