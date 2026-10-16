"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Card, Empty } from "@/components/mosque/ui";
import { DashboardShell } from "@/components/mosque/shell";
import { mosqueNavItems } from "@/components/mosque/mosque-nav";
import { SettingsIcon } from "@/components/mosque/icons";
import type { MosqueFeature } from "@/lib/mosque/db";

type Mosque = { id: number; name: string; city: string };
type Role = "super" | "mosque" | null;

/** تفعيل/تعطيل مزايا هذا الجامع — بطاقة لكل ميزة، و"قريباً" معطّلة */
export default function MosqueSettingsPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  const [role, setRole] = useState<Role | "checking">("checking");
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [featuresMap, setFeaturesMap] = useState<Record<string, boolean>>({});
  const [features, setFeatures] = useState<MosqueFeature[] | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function check() {
      const superRes = await fetch("/api/admin/me").then((r) => r.json()).catch(() => ({ admin: false })); // 404 على المستضيف العام
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
          setFeaturesMap(d.features);
        }
      })
      .catch(() => undefined);
    fetch(`/api/mosques/${mosqueId}/features`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { features: MosqueFeature[] } | null) => setFeatures(d?.features ?? null))
      .catch(() => setFeatures(null));
  }, [role, mosqueId]);

  async function logout() {
    await fetch(role === "mosque" ? "/api/mosque-admin/logout" : "/api/admin/logout", { method: "POST" });
    setRole(null);
  }

  async function toggle(feature: MosqueFeature) {
    setBusyKey(feature.key);
    setError(null);
    try {
      const res = await fetch(`/api/mosques/${mosqueId}/features`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: feature.key, enabled: !feature.enabled }),
      });
      const d = (await res.json().catch(() => ({}))) as { features?: MosqueFeature[]; error?: string };
      if (!res.ok) {
        setError(d.error ?? "تعذّر الحفظ");
        return;
      }
      if (d.features) {
        setFeatures(d.features);
        setFeaturesMap(
          Object.fromEntries(d.features.map((f) => [f.key, f.enabled && f.status === "ready"])),
        );
      }
    } finally {
      setBusyKey(null);
    }
  }

  if (role === "checking") return <Empty title="جارٍ التحقق…" />;
  if (!role) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <p className="mb-3 text-sm text-muted-foreground">سجّل دخولك أولاً.</p>
        <div className="flex justify-center gap-4">
          <Link href="/mosque" className="text-sm text-primary hover:underline">
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

  const ready = features?.filter((f) => f.status === "ready") ?? null;
  const soon = features?.filter((f) => f.status === "soon") ?? null;

  return (
    <DashboardShell
      nav={mosqueNavItems({
        mosqueId,
        mosqueName: mosque.name,
        features: featuresMap,
        isSuper: role === "super",
        activeHref: `/mosque/${mosqueId}/settings`,
      })}
      title="الإعدادات"
      subtitle={mosque.name}
      userLabel={role === "super" ? "المشرف العام" : "مدير الجامع"}
      onLogout={logout}
    >
      <div className="space-y-5">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <SettingsIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold">مزايا الجامع</p>
            <p className="text-xs text-muted-foreground">
              شغّل ما تحتاجه وعرّض الباقي — التغيير يطبّق على هذا الجامع فقط.
            </p>
          </div>
        </Card>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {ready === null ? (
          <Empty title="جارٍ تحميل المزايا…" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {ready.map((feature) => (
              <FeatureCard
                key={feature.key}
                feature={feature}
                busy={busyKey === feature.key}
                onToggle={() => toggle(feature)}
              />
            ))}
          </div>
        )}

        {soon !== null && soon.length > 0 && (
          <div>
            <h2 className="mb-3 font-naskh text-lg font-bold">قريباً</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {soon.map((feature) => (
                <FeatureCard key={feature.key} feature={feature} busy={false} onToggle={() => undefined} />
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}

function FeatureCard({
  feature,
  busy,
  onToggle,
}: {
  feature: MosqueFeature;
  busy: boolean;
  onToggle: () => void;
}) {
  const soon = feature.status !== "ready";
  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{feature.nameAr}</p>
          {soon && <Badge tone="warn">قريباً</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{feature.descriptionAr}</p>
      </div>
      <ToggleSwitch
        on={feature.enabled && !soon}
        disabled={soon || busy}
        label={`تفعيل ${feature.nameAr}`}
        onChange={onToggle}
      />
    </Card>
  );
}

function ToggleSwitch({
  on,
  disabled,
  label,
  onChange,
}: {
  on: boolean;
  disabled: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
        on ? "bg-primary" : "bg-muted"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${
          on ? "left-0.5" : "right-0.5"
        }`}
      />
    </button>
  );
}
