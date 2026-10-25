"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ParentAuthForm } from "@/components/parent-auth-form";
import { ParentHowToCard } from "@/components/parent-how-to";
import { useParentSession } from "@/components/parent-shell";

/*
  STEP 61 — صفحة قبول دعوة ولي الأمر: /parent/join?token=…
  غير مسجّل → إنشاء حساب أو دخول ثم شاشة تأكيد الربط؛ لا يُكشف اسم الطالب
  قبل الدخول ولا يُستهلك الرمز إلا بضغطة التأكيد.
*/
export default function ParentJoinPage() {
  return (
    <Suspense>
      <JoinFlow />
    </Suspense>
  );
}

type Preview = { studentName: string; halaqahName: string };

function JoinFlow() {
  const router = useRouter();
  const token = useSearchParams().get("token")?.trim() ?? "";
  const { parent, checking } = useParentSession();

  // null = لم يُجلب بعد، "invalid" = غير صالح، وإلا البيانات
  const [preview, setPreview] = useState<Preview | "invalid" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const parentId = parent?.id ?? null;

  useEffect(() => {
    if (!token || parentId === null) return;
    let cancelled = false;
    fetch(`/api/parent/link?token=${encodeURIComponent(token)}`)
      .then((res): Promise<Preview | "invalid"> => (res.ok ? res.json() : Promise.resolve("invalid")))
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setPreview("invalid");
      });
    return () => {
      cancelled = true;
    };
  }, [token, parentId]);

  async function confirmLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/parent/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        child?: { halaqahId: number; studentId: string };
      };
      if (!res.ok || !data.child) {
        setError(data.error ?? "تعذّر الربط");
        return;
      }
      router.replace(
        `/parent?halaqah=${data.child.halaqahId}&student=${encodeURIComponent(data.child.studentId)}`,
      );
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return <Message>رابط الدعوة ناقص — اطلب رابطاً جديداً من المعلّم أو من ابنك.</Message>;
  }
  if (checking) return <p className="text-sm text-stone-500">جارٍ التحقق…</p>;

  if (!parent) {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="font-display text-xl font-bold text-white">دعوة لمتابعة ابنك</h1>
        <p className="text-sm text-white/70">أنشئ حساب ولي أمر أو سجّل دخولك لإكمال الربط.</p>
        <ParentHowToCard />
        <ParentAuthForm initialMode="register" />
      </div>
    );
  }

  if (preview === null) return <p className="text-sm text-stone-500">جارٍ التحقق من الرابط…</p>;
  if (preview === "invalid") {
    return (
      <Message>
        الرابط غير صالح أو منتهي أو سبق استخدامه — اطلب رابطاً جديداً.{" "}
        <Link href="/parent" className="font-semibold text-accent-ink underline">
          إلى لوحتي
        </Link>
      </Message>
    );
  }

  return (
    <div className="force-light mx-auto max-w-sm space-y-4 rounded-2xl border border-stone-200 bg-white p-5 text-center">
      <p className="text-2xl">👪</p>
      <p className="text-sm text-stone-700">
        ربط حسابك بالطالب «<span className="font-bold">{preview.studentName}</span>» في حلقة «
        <span className="font-bold">{preview.halaqahName}</span>»
      </p>
      <p className="text-xs text-stone-500">ستتمكّن من متابعة تقدّمه (قراءة فقط).</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="button"
        onClick={confirmLink}
        disabled={busy}
        className="w-full cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "لحظة…" : "تأكيد الربط"}
      </button>
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return <div className="force-light rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600">{children}</div>;
}
