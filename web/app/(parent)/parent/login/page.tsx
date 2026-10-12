"use client";

import { useRouter } from "next/navigation";
import { ParentAuthForm } from "@/components/parent-auth-form";

export default function ParentLoginPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-sm space-y-4">
      <h1 className="font-naskh text-xl font-bold text-slate-800">دخول ولي الأمر</h1>
      <p className="text-sm text-slate-500">تابع حفظ ومراجعة أبنائك. للحصول على أول ربط اطلب رابط الدعوة من المعلّم أو من ابنك.</p>
      <ParentAuthForm onDone={() => router.replace("/parent")} />
    </div>
  );
}
