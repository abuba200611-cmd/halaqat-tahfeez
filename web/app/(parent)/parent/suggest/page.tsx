"use client";

import Link from "next/link";
import { SuggestionForm } from "@/components/suggestion-form";
import { useParentSession } from "@/components/parent-shell";

/** اقتراح/بلاغ ولي الأمر — نفس نموذج المعلّم تماماً (dev split: بلاغ من كل الأدوار) */
export default function ParentSuggestPage() {
  const { parent, checking } = useParentSession();

  if (checking) return <p className="text-sm text-slate-500">جارٍ التحقق…</p>;
  if (!parent) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="mb-3 text-sm text-slate-600">سجّل دخولك لمتابعة أبنائك.</p>
        <Link
          href="/parent/login"
          className="inline-block rounded-xl bg-blue-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-800"
        >
          تسجيل الدخول
        </Link>
      </div>
    );
  }

  return <SuggestionForm endpoint="/api/parent/suggestions" maxLength={1000} />;
}
