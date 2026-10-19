"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card } from "@/components/ui";
import { PushToggle } from "@/components/push-toggle";
import { BuddyResetSetting, ClassmatesVisibleSetting } from "@/components/halaqah-settings";

type Me = { teacherName?: string; halaqahName?: string; role?: "supervisor" | "assistant"; email?: string | null };

const LINK = "font-semibold text-accent-ink underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** الإعدادات — تجمع خيارات الحلقة والحساب الموجودة أصلاً؛ كل عنصر يربط بمسار/واجهة قائمة */
export default function TeacherSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: { teacher: Me | null }) => setMe(data.teacher))
      .catch(() => {});
  }, []);

  async function logoutAll() {
    if (!window.confirm("سيُنهى تسجيل دخولك على كل الأجهزة. متابعة؟")) return;
    setBusy(true);
    try {
      await fetch("/api/auth/logout-all", { method: "POST" });
      window.location.href = "/";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">الإعدادات</h1>

      <section className="space-y-3" aria-labelledby="set-halaqah">
        <h2 id="set-halaqah" className="text-sm font-semibold text-muted-foreground">إعدادات الحلقة</h2>
        <BuddyResetSetting />
        <ClassmatesVisibleSetting />
      </section>

      <section className="space-y-3" aria-labelledby="set-notify">
        <h2 id="set-notify" className="text-sm font-semibold text-muted-foreground">الإشعارات</h2>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <span className="text-sm">إشعارات الوارد على هذا الجهاز</span>
          <PushToggle />
        </Card>
      </section>

      <section className="space-y-3" aria-labelledby="set-account">
        <h2 id="set-account" className="text-sm font-semibold text-muted-foreground">الحساب</h2>
        <Card className="space-y-3 p-4 text-sm">
          {me && (
            <p>
              {me.teacherName || "معلّم"} — {me.role === "assistant" ? "مساعد مشرف" : "مشرف"} · {me.halaqahName}
            </p>
          )}
          <ul className="space-y-2">
            <li>
              <Link href="/forgot-password" className={LINK}>تغيير كلمة المرور (عبر البريد)</Link>
            </li>
            <li>
              <Link href="/join-mosque" className={LINK}>الانضمام إلى جامع برابط الدعوة</Link>
            </li>
            <li>
              <Link href="/suggest" className={LINK}>اقتراح / بلاغ</Link>
            </li>
          </ul>
          <Button variant="ghost" onClick={logoutAll} disabled={busy} className="text-xs">
            {busy ? "لحظة…" : "تسجيل الخروج من كل الأجهزة"}
          </Button>
        </Card>
      </section>
    </div>
  );
}
