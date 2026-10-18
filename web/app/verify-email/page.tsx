"use client";

import { BrandLockup } from "@/components/brand";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailInner />
    </Suspense>
  );
}

function VerifyEmailInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"checking" | "ok" | "error">(token ? "checking" : "error");
  const [error, setError] = useState<string | null>(
    token ? null : "الرابط ناقص — تأكد إنك فتحته كاملاً من البريد.",
  );

  useEffect(() => {
    if (!token) return;
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setState("error");
          setError(data.error ?? "تعذّر تأكيد البريد");
          return;
        }
        setState("ok");
      })
      .catch(() => {
        setState("error");
        setError("تعذّر الاتصال بالخادم");
      });
  }, [token]);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10">
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onLight" size={44} />
      </div>
      <h1 className="font-display mb-1 text-center text-2xl font-bold text-primary">تأكيد البريد</h1>
      <Card className="mt-5 p-5 text-center">
        {state === "checking" && <p className="text-sm text-muted-foreground">جارٍ التأكيد…</p>}
        {state === "ok" && (
          <>
            <p className="mb-3 text-sm text-success">تم تأكيد بريدك ✓</p>
            <Link href="/" className="text-sm text-accent-ink hover:underline">
              الرجوع للمعلم
            </Link>
          </>
        )}
        {state === "error" && <p className="text-sm text-destructive">{error}</p>}
      </Card>
    </main>
  );
}
