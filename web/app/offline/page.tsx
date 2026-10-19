import type { Metadata } from "next";
import Image from "next/image";
import { RetryButton } from "./retry-button";

/* صفحة الانقطاع — يخزّنها عامل الخدمة وقت التثبيت (public/sw.js) فلا تعتمد على أي بيانات ولا جلسة. */
export const metadata: Metadata = { title: "غير متصل — السلام", robots: { index: false } };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-1 flex-col items-center justify-center bg-black px-6 py-16 text-center">
      <Image src="/brand/logo-light.png" alt="شعار السلام" width={72} height={77} priority />
      <p className="font-display mt-5 text-3xl leading-none text-white">السلام</p>
      <h1 className="mt-10 text-2xl font-bold text-white">أنت غير متصل</h1>
      <p className="mt-3 max-w-xs text-sm leading-7 text-[#CDB49E]">
        تعذّر الوصول للإنترنت. تحقّق من اتصالك ثم أعد المحاولة، وسيعود كل شيء كما تركته.
      </p>
      <div className="mt-8">
        <RetryButton />
      </div>
    </main>
  );
}
