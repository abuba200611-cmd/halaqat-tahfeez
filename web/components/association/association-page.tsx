"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { DashboardShell } from "@/components/mosque/shell";
import { Empty } from "@/components/mosque/ui";
import { BuildingIcon, ClipboardIcon } from "@/components/mosque/icons";

type Me = { admin: { username: string } | null; association: { name: string; city: string } | null };

/**
 * هيكل صفحات /association: يتحقق من جلسة مدير الجمعية ثم يرسم السايدبار.
 * لا يعرض المحتوى إلا بعد نجاح التحقق، فالصفحات الداخلية تجلب بياناتها وهي
 * واثقة من الجلسة (والمسارات نفسها تتحقق من جديد خادمياً).
 */
export function AssociationPage({
  title,
  activeHref,
  children,
}: {
  title: string;
  activeHref: string;
  children: ReactNode;
}) {
  const [me, setMe] = useState<Me | "checking" | null>("checking");

  useEffect(() => {
    fetch("/api/association/me")
      .then((res) => res.json() as Promise<Me>)
      .then((data) => setMe(data.admin ? data : null))
      .catch(() => setMe(null));
  }, []);

  async function logout() {
    await fetch("/api/association/logout", { method: "POST" });
    setMe(null);
  }

  if (me === "checking") return <Empty title="جارٍ التحقق…" />;
  if (!me) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <p className="mb-3 text-sm text-muted-foreground">سجّل دخولك أولاً.</p>
        <Link href="/association-login" className="text-sm text-accent-ink hover:underline">
          دخول مدير الجمعية
        </Link>
      </main>
    );
  }

  return (
    <DashboardShell
      brandTitle="لوحة الجمعية"
      nav={[
        { href: "/association", label: me.association?.name ?? "الجمعية", icon: <BuildingIcon />, active: activeHref === "/association" },
        {
          href: "/association/visits",
          label: "زيارات المشرف التربوي",
          icon: <ClipboardIcon />,
          active: activeHref === "/association/visits" || activeHref?.startsWith("/association/visits/"),
        },
      ]}
      title={title}
      subtitle={me.association?.name}
      userLabel={me.admin?.username ?? "مدير الجمعية"}
      onLogout={logout}
    >
      {children}
    </DashboardShell>
  );
}
