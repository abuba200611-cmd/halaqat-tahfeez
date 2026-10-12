"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Empty } from "./ui";
import { DashboardShell } from "./shell";
import { mosqueNavItems } from "./mosque-nav";

type Mosque = { id: number; name: string; city: string };
type Role = "super" | "mosque" | null;

/**
 * هيكل صفحات المزايا تحت /mosque/[id]: يتحقق من الدخول، يحمّل الجامع ومزاياه،
 * ويرسم السايدبار — ولا يعرض المحتوى (children) إلا بعد نجاح ذلك، فالصفحات
 * الداخلية تجلب بياناتها بنفسها وهي واثقة أن المستخدم مصرّح.
 */
export function MosquePage({
  mosqueId,
  activeHref,
  title,
  children,
}: {
  mosqueId: number;
  activeHref: string;
  title: string;
  children: ReactNode;
}) {
  const [role, setRole] = useState<Role | "checking">("checking");
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function check() {
      const superRes = await fetch("/api/admin/me").then((r) => r.json());
      if (superRes.admin) {
        setRole("super");
        return;
      }
      const mosqueRes = await fetch("/api/mosque-admin/me").then((r) => r.json());
      setRole(mosqueRes.admin && mosqueRes.admin.mosqueId === mosqueId ? "mosque" : null);
    }
    check().catch(() => setRole(null));
  }, [mosqueId]);

  useEffect(() => {
    if (role !== "super" && role !== "mosque") return;
    fetch(`/api/mosques/${mosqueId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { mosque: Mosque; features: Record<string, boolean> } | null) => {
        if (d) {
          setMosque(d.mosque);
          setFeatures(d.features);
        }
      })
      .catch(() => undefined);
  }, [role, mosqueId]);

  async function logout() {
    await fetch(role === "mosque" ? "/api/mosque-admin/logout" : "/api/admin/logout", { method: "POST" });
    setRole(null);
  }

  if (role === "checking") return <Empty title="جارٍ التحقق…" />;
  if (!role) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <p className="mb-3 text-sm text-muted-foreground">سجّل دخولك أولاً.</p>
        <div className="flex justify-center gap-4">
          <Link href="/" className="text-sm text-primary hover:underline">
            دخول المشرف العام
          </Link>
          <Link href="/mosque-login" className="text-sm text-primary hover:underline">
            دخول مدير الجامع
          </Link>
        </div>
      </main>
    );
  }
  if (!mosque) return <Empty title="جارٍ التحميل…" />;

  return (
    <DashboardShell
      nav={mosqueNavItems({ mosqueId, mosqueName: mosque.name, features, isSuper: role === "super", activeHref })}
      title={title}
      subtitle={mosque.name}
      userLabel={role === "super" ? "المشرف العام" : "مدير الجامع"}
      onLogout={logout}
    >
      {children}
    </DashboardShell>
  );
}

/** حالة مشتركة لجلب لم يصل: تحميل، أو ميزة معطّلة (404)، أو خطأ */
export function ApiState({
  loading,
  status,
  mosqueId,
  featureName,
}: {
  loading: boolean;
  status: number | null;
  mosqueId: number;
  featureName: string;
}) {
  if (loading) return <Empty title="جارٍ التحميل…" />;
  if (status === 404) {
    return (
      <Empty
        title={`${featureName} غير مفعّل لهذا الجامع.`}
        action={
          <Link href={`/mosque/${mosqueId}/settings`} className="text-sm text-primary hover:underline">
            تفعيله من الإعدادات
          </Link>
        }
      />
    );
  }
  return <Empty title="تعذّر تحميل البيانات." />;
}

export const inputClass =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";
