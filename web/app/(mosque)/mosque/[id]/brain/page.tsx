"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Empty } from "@/components/mosque/ui";
import { DashboardShell } from "@/components/mosque/shell";
import { mosqueNavItems } from "@/components/mosque/mosque-nav";
import { BrainGraph } from "@/components/mosque/brain-graph";
import type { MosqueGraph } from "@/lib/mosque/graph-types";

type Mosque = { id: number; name: string; city: string };
type Role = "super" | "mosque" | null;

/** دماغ الجامع — خريطة شبكية تُبنى تلقائياً من بيانات الجامع (حلقات، معلّمون، طلاب، تسجيل، مزايا) */
export default function BrainPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  const [role, setRole] = useState<Role | "checking">("checking");
  const [mosque, setMosque] = useState<Mosque | null>(null);
  const [featuresMap, setFeaturesMap] = useState<Record<string, boolean>>({});
  const [graph, setGraph] = useState<MosqueGraph | null | undefined>(undefined);

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

  async function logout() {
    await fetch(role === "mosque" ? "/api/mosque-admin/logout" : "/api/admin/logout", { method: "POST" });
    setRole(null);
  }

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
    fetch(`/api/mosques/${mosqueId}/brain/graph`)
      .then((res) => (res.ok ? (res.json() as Promise<MosqueGraph>) : null))
      .then(setGraph)
      .catch(() => setGraph(null));
  }, [role, mosqueId]);

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
  if (graph === undefined || !mosque) return <Empty title="جارٍ التحميل…" />;

  return (
    <DashboardShell
      nav={mosqueNavItems({
        mosqueId,
        mosqueName: mosque.name,
        features: featuresMap,
        isSuper: role === "super",
        activeHref: `/mosque/${mosqueId}/brain`,
      })}
      title="الدماغ"
      subtitle={mosque.name}
      userLabel={role === "super" ? "المشرف العام" : "مدير الجامع"}
      onLogout={logout}
    >
      {graph === null ? (
        <Empty
          title="الدماغ غير مفعّل لهذا الجامع."
          action={
            <Link href={`/mosque/${mosqueId}/settings`} className="text-sm text-primary hover:underline">
              تفعيله من الإعدادات
            </Link>
          }
        />
      ) : !graph.nodes.some((node) => node.type === "halaqah") ? (
        <Empty title="لا توجد حلقات بعد — أضف أول حلقة لتظهر شبكة الجامع هنا." />
      ) : (
        <BrainGraph graph={graph} />
      )}
    </DashboardShell>
  );
}
