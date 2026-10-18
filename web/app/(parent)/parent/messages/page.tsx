"use client";

import Link from "next/link";
import { Messenger } from "@/components/messaging/messenger";
import { useParentSession } from "@/components/parent-shell";

export default function ParentMessagesPage() {
  const { parent, checking } = useParentSession();

  if (checking) return <p className="text-sm text-muted-foreground">جارٍ التحقق…</p>;
  if (!parent) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <p className="mb-3 text-sm text-muted-foreground">سجّل دخولك لعرض رسائلك.</p>
        <Link href="/parent/login" className="inline-block rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary">
          تسجيل الدخول
        </Link>
      </div>
    );
  }
  return <Messenger role="parent" />;
}
