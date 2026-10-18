"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ParentAuthForm } from "@/components/parent-auth-form";
import { BrandLockup } from "@/components/brand";

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
      <BrandLockup tone="onLight" size={40} />
      <h1 className="font-display mt-3 text-xl font-bold text-foreground">دخول ولي الأمر</h1>
      <p className="text-sm text-stone-500">تابع حفظ ومراجعة أبنائك. للحصول على أول ربط اطلب رابط الدعوة من المعلّم أو من ابنك.</p>
      <ParentAuthForm initialEmail={searchParams.get("email") ?? ""} onDone={onDone} />
    </div>
  );
}
