"use client";

import { BackButton } from "@/components/back-button";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SuggestionForm } from "@/components/suggestion-form";

type Role = "mosque" | "super" | null;

/**
 * اقتراح/بلاغ من داخل جامع — لمدير الجامع (أو المشرف العام فاتحاً هذا
 * الجامع). نفس نموذج المعلّم تماماً؛ التحقق من الجلسة يجري أصلاً في
 * مسار الإرسال، وهنا نبقي الواجهة متسقة مع بقية صفحات الجامع.
 */
export default function MosqueSuggestPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const [role, setRole] = useState<Role | "checking">("checking");

  useEffect(() => {
    async function check() {
      const superRes = await fetch("/api/admin/me").then((r) => r.json()).catch(() => null);
      if (superRes?.admin) {
        setRole("super");
        return;
      }
      const mosqueRes = await fetch("/api/mosque-admin/me").then((r) => r.json()).catch(() => null);
      setRole(mosqueRes?.admin && mosqueRes.admin.mosqueId === mosqueId ? "mosque" : null);
    }
    check().catch(() => setRole(null));
  }, [mosqueId]);

  if (role === "checking") return <p className="p-6 text-sm text-muted-foreground">جارٍ التحقق…</p>;
  if (!role) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <BackButton force href="/welcome" className="mb-4 self-start" />
        <p className="mb-3 text-sm text-muted-foreground">سجّل دخولك أولاً.</p>
        <Link href="/mosque-login" className="text-sm text-accent-ink hover:underline">
          دخول مدير الجامع
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">
      <BackButton className="mb-4" />
      <SuggestionForm endpoint="/api/mosque-admin/suggestions" maxLength={1000} />
    </main>
  );
}
