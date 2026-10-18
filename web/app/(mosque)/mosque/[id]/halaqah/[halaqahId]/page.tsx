"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Card, Empty } from "@/components/mosque/ui";
import { DashboardShell } from "@/components/mosque/shell";
import { mosqueNavItems } from "@/components/mosque/mosque-nav";
import { BookIcon, UsersIcon } from "@/components/mosque/icons";

type Halaqah = { id: number; mosqueId: number; halaqahName: string; teacherName: string };
type RosterStudent = { name: string; group: string; pages: number; avgMastery: number; active: boolean };
type Roster = { teacherName: string; halaqahName: string; students: RosterStudent[] };
type MosqueInfo = { name: string; features: Record<string, boolean> };

type Role = "super" | "mosque" | null;

export default function HalaqahDetailPage() {
  const params = useParams<{ id: string; halaqahId: string }>();
  const mosqueId = Number(params.id);
  const halaqahId = Number(params.halaqahId);

  const [role, setRole] = useState<Role | "checking">("checking");
  const [mosqueInfo, setMosqueInfo] = useState<MosqueInfo | null>(null);
  const [data, setData] = useState<{ halaqah: Halaqah; roster: Roster } | null | undefined>(undefined);

  useEffect(() => {
    async function check() {
      const superRes = await fetch("/api/admin/me").then((r) => r.json()).catch(() => ({ admin: false })); // 404 على المستضيف العام
      if (superRes.admin) {
        setRole("super");
        return;
      }
      const mosqueRes = await fetch("/api/mosque-admin/me").then((r) => r.json());
      if (mosqueRes.admin && mosqueRes.admin.mosqueId === mosqueId) {
        setRole("mosque");
        return;
      }
      setRole(null);
    }
    check().catch(() => setRole(null));
  }, [mosqueId]);

  useEffect(() => {
    if (role !== "super" && role !== "mosque") return;
    fetch(`/api/mosques/${mosqueId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { mosque: { name: string }; features: Record<string, boolean> } | null) => {
        if (d) setMosqueInfo({ name: d.mosque.name, features: d.features });
      })
      .catch(() => undefined);
    fetch(`/api/halaqahs/${halaqahId}/roster`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [role, mosqueId, halaqahId]);

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
          <Link href="/mosque" className="text-sm text-accent-ink hover:underline">
            دخول المشرف العام
          </Link>
          <Link href="/mosque-login" className="text-sm text-accent-ink hover:underline">
            دخول مدير الجامع
          </Link>
        </div>
      </main>
    );
  }
  if (data === undefined) return <Empty title="جارٍ التحميل…" />;
  if (!data) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <p className="text-sm text-destructive">تعذّر جلب بيانات الحلقة حالياً — حاول لاحقاً.</p>
        <Link href={`/mosque/${mosqueId}`} className="mt-3 text-sm text-accent-ink hover:underline">
          الرجوع لصفحة الجامع
        </Link>
      </main>
    );
  }

  const { roster } = data;
  const activeCount = roster.students.filter((s) => s.active).length;

  return (
    <DashboardShell
      nav={mosqueNavItems({
        mosqueId,
        mosqueName: mosqueInfo?.name ?? "الجامع",
        features: mosqueInfo?.features ?? {},
        isSuper: role === "super",
        extra: {
          href: `/mosque/${mosqueId}/halaqah/${halaqahId}`,
          label: roster.halaqahName,
          icon: <BookIcon />,
          active: true,
        },
      })}
      title={roster.halaqahName}
      subtitle={roster.teacherName || "الطلاب المسجّلون بهذه الحلقة"}
      userLabel={role === "super" ? "المشرف العام" : "مدير الجامع"}
      onLogout={logout}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UsersIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الطلاب</p>
              <p className="tabular text-xl font-bold">{roster.students.length}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UsersIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">النشطون</p>
              <p className="tabular text-xl font-bold">{activeCount}</p>
            </div>
          </div>
        </div>

        {roster.students.length === 0 ? (
          <Empty title="ما فيه طلاب مسجّلون بهذه الحلقة بعد." />
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[28rem] text-right text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr className="text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">الاسم</th>
                  <th className="px-3 py-2 font-medium">المجموعة</th>
                  <th className="px-3 py-2 font-medium">المحفوظ</th>
                  <th className="px-3 py-2 font-medium">الإتقان</th>
                  <th className="px-3 py-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {roster.students.map((s, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.group || "—"}</td>
                    <td className="tabular px-3 py-2">{s.pages} ص</td>
                    <td className="px-3 py-2">
                      <Badge tone={s.avgMastery >= 75 ? "good" : s.avgMastery >= 55 ? "neutral" : "warn"}>
                        {s.avgMastery}٪
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={s.active ? "good" : "neutral"}>{s.active ? "نشط" : "غير نشط"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DashboardShell>
  );
}
