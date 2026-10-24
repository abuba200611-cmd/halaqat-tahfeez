"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ParentAuthForm } from "@/components/parent-auth-form";
import { ParentHowToCard } from "@/components/parent-how-to";
import { BrandLockup } from "@/components/brand";
import { AuthBackLink } from "@/components/auth-back-link";

export default function ParentLoginPage() {
  const router = useRouter();
  return (
    <Suspense fallback={null}>
      <ParentLoginInner onDone={() => router.replace("/parent")} />
    </Suspense>
  );
}

/** يقرأ ?email= (تعبئة مسبقة من مبدّل الأدوار عند تحويل المستخدم لإثبات كلمة مرور الولي) */
function ParentLoginInner({ onDone }: { onDone: () => void }) {
  const searchParams = useSearchParams();
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <AuthBackLink tone="onLight" />
      <BrandLockup tone="onLight" size={40} href="/welcome" />
      <h1 className="font-display mt-3 text-xl font-bold text-foreground">دخول ولي الأمر</h1>
      <p className="text-sm text-muted-foreground">تابع حفظ ومراجعة أبنائك.</p>
      <ParentHowToCard id="how-to" />
      <ParentAuthForm initialEmail={searchParams.get("email") ?? ""} onDone={onDone} />
    </div>
  );
}
