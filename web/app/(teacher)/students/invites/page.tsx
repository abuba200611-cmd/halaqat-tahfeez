"use client";

import Link from "next/link";
import { InviteLinksSection } from "@/components/invite-links-section";

/** صفحة روابط الدعوة — رابط الطلاب ورابط المعلّم المساعد وفريق الحلقة (انتقلت من صفحة الطلاب) */
export default function InvitesPage() {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">روابط الدعوة</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            شارك الرابط المناسب لينضم الطلاب أو المعلّمون المساعدون إلى حلقتك تلقائياً.
          </p>
        </div>
        <Link href="/students" className="text-xs font-semibold text-accent-ink hover:underline">
          → كل الطلاب
        </Link>
      </div>
      <InviteLinksSection />
    </div>
  );
}
