"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty, Stat } from "@/components/mosque/ui";
import { DashboardShell } from "@/components/mosque/shell";
import { mosqueNavItems } from "@/components/mosque/mosque-nav";
import { AgentChatPanel } from "@/components/mosque/agent-chat";
import { BookIcon, LinkIcon, ShieldIcon, TrendUpIcon, UsersIcon } from "@/components/mosque/icons";

import { BackButton } from "@/components/back-button";
type Mosque = { id: number; name: string; city: string };
type Halaqah = { id: number; halaqahName: string; teacherName: string; inviteCode: string };
type Pending = {
  id: number;
  name: string;
  phone: string;
  status: "pending" | "assigned" | "waitlisted";
  halaqahId: number | null;
  createdAt: string;
};
type Features = Record<string, boolean>;

type Role = "super" | "mosque" | null;

export default function MosqueDetailPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  const [role, setRole] = useState<Role | "checking">("checking");
  const [data, setData] = useState<
    { mosque: Mosque; halaqahs: Halaqah[]; registrations: Pending[]; features: Features } | null
  >(null);
  const [inviteCode, setInviteCode] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function load() {
    fetch(`/api/mosques/${mosqueId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d: { mosque: Mosque; halaqahs: Halaqah[]; registrations: Pending[]; features: Features } | null) =>
        setData(d),
      )
      .catch(() => setData(null));
  }

  useEffect(() => {
    async function check() {
      const superRes = await fetch("/api/admin/me").then((r) => r.json()).catch(() => ({ admin: false })); // 404 على المستضيف العام
      if (superRes.admin) {
        setRole("super");
        load();
        return;
      }
      const mosqueRes = await fetch("/api/mosque-admin/me").then((r) => r.json());
      if (mosqueRes.admin && mosqueRes.admin.mosqueId === mosqueId) {
        setRole("mosque");
        load();
        return;
      }
      setRole(null);
    }
    check().catch(() => setRole(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mosqueId]);

  async function logout() {
    await fetch(role === "mosque" ? "/api/mosque-admin/logout" : "/api/admin/logout", { method: "POST" });
    setRole(null);
  }

  async function addHalaqah(event: React.FormEvent) {
    event.preventDefault();
    setAddBusy(true);
    setAddError(null);
    try {
      const res = await fetch(`/api/mosques/${mosqueId}/halaqahs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteCode }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setAddError(d.error ?? "تعذّرت الإضافة");
        return;
      }
      setInviteCode("");
      load();
    } finally {
      setAddBusy(false);
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/j/${mosqueId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // متروك بالحقل أصلاً
    }
  }

  if (role === "checking") return <Empty title="جارٍ التحقق…" />;
  if (!role) {
    return (
      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-10 text-center">
        <BackButton force href="/welcome" className="mb-4 self-start" />
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
  if (!data) return <Empty title="جارٍ التحميل…" />;

  const registrationLink = `/j/${mosqueId}`;

  return (
    <DashboardShell
      nav={mosqueNavItems({
        mosqueId,
        mosqueName: data.mosque.name,
        features: data.features,
        isSuper: role === "super",
        activeHref: `/mosque/${mosqueId}`,
      })}
      title={data.mosque.name}
      subtitle={data.mosque.city || "لوحة الجامع"}
      userLabel={role === "super" ? "المشرف العام" : "مدير الجامع"}
      onLogout={logout}
    >
      <div className="space-y-5">
        {data.features.stats && <MosqueStatsSection mosqueId={mosqueId} />}

        {data.features.supervisor_visits && <VisitAveragesCard mosqueId={mosqueId} />}

        {data.features.agent && <AgentChatPanel mosqueId={mosqueId} />}

        {role === "super" && <MosqueAdminAccountCard mosqueId={mosqueId} />}

        {data.features.registration && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2">
            <LinkIcon className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold">رابط تسجيل الجامع</p>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            شاركه مع طلاب الجامع الجدد — يسجّلون اهتمامهم بدون اختيار حلقة، وتوزّعهم أنت من هنا.
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={typeof window === "undefined" ? registrationLink : `${window.location.origin}${registrationLink}`}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
            />
            <Button onClick={copyLink} className="shrink-0">
              {copied ? "نُسخ ✓" : "نسخ"}
            </Button>
          </div>
        </Card>
        )}

        {data.features.halaqat && <TeacherJoinLinkCard mosqueId={mosqueId} />}

        {data.features.halaqat && (
        <details id="add-halaqah" className="group scroll-mt-24 rounded-2xl border border-border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">إضافة يدوية</summary>
          <p className="mb-3 mt-3 text-xs text-muted-foreground">
            الأصل أن يفتح مشرف الحلقة رابط انضمام المعلّمين أعلاه. أو اطلب منه رابط دعوة طلاب حلقته (صفحة الطلاب)، وألصق رمزه هنا فقط
            (آخر جزء من الرابط بعد <span className="tabular">invite=</span>).
          </p>
          <form onSubmit={addHalaqah} className="flex gap-2">
            <input
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="رمز دعوة الحلقة"
              required
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
            <Button type="submit" disabled={addBusy} className="shrink-0">
              {addBusy ? "لحظة…" : "إضافة"}
            </Button>
          </form>
          {addError && <p className="mt-2 text-sm text-destructive">{addError}</p>}
        </details>
        )}

        {data.features.halaqat && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">الحلقات ({data.halaqahs.length})</h2>
          {data.halaqahs.length === 0 ? (
            <Empty
              title="ما فيه حلقات مضافة بعد."
              action={
                <Button variant="ghost" onClick={openManualAdd} className="text-sm">
                  أضف حلقة
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {data.halaqahs.map((h) => (
                <li key={h.id}>
                  <Link href={`/mosque/${mosqueId}/halaqah/${h.id}`}>
                    <Card className="flex items-center gap-3 p-3 transition-shadow duration-200 hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <BookIcon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{h.halaqahName}</p>
                        {h.teacherName && <p className="truncate text-xs text-muted-foreground">{h.teacherName}</p>}
                      </div>
                      <span className="text-sm text-primary">←</span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        )}

        {data.features.registration && (
        <div>
          <h2 className="mb-3 font-display text-lg font-bold">
            طلاب بانتظار التوزيع ({data.registrations.filter((p) => p.status === "pending").length})
          </h2>
          {data.registrations.length === 0 ? (
            <Empty
              title="ما فيه تسجيلات جديدة بعد."
              action={
                <Button variant="ghost" onClick={copyLink} className="text-sm">
                  {copied ? "نُسخ ✓" : "انسخ رابط التسجيل"}
                </Button>
              }
            />
          ) : (
            <ul className="space-y-2">
              {data.registrations.map((p) => (
                <PendingRow key={p.id} pending={p} halaqahs={data.halaqahs} onAssigned={load} />
              ))}
            </ul>
          )}
        </div>
        )}
      </div>
    </DashboardShell>
  );
}

/** زيارات المشرف التربوي — متوسط درجة كل حلقة خلال آخر ٩٠ يوماً (بطاقة بسيطة) */
function VisitAveragesCard({ mosqueId }: { mosqueId: number }) {
  const [data, setData] = useState<
    { halaqat: { halaqahId: number; halaqahName: string; visits: number; avgScore: number | null }[]; overall: number | null } | null | undefined
  >(undefined);

  useEffect(() => {
    fetch(`/api/mosques/${mosqueId}/supervisor-visits/summary`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => setData(null));
  }, [mosqueId]);

  if (data === undefined) return null;
  const withScore = data?.halaqat.filter((h) => h.avgScore !== null) ?? [];

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">زيارات المشرف التربوي</h2>
        {data?.overall !== null && data?.overall !== undefined && (
          <Badge tone="good">متوسط الجامع {data.overall}٪</Badge>
        )}
      </div>
      <p className="mb-3 text-xs text-muted-foreground">متوسط درجات الزيارات المنجزة لكل حلقة خلال آخر ٩٠ يوماً.</p>
      {withScore.length === 0 ? (
        <p className="text-xs text-muted-foreground">لا زيارات منجزة خلال الفترة — <Link href={`/mosque/${mosqueId}/supervisor-visits`} className="text-accent-ink hover:underline">جدولة زيارة</Link>.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {withScore.map((h) => (
            <Badge key={h.halaqahId} tone={h.avgScore !== null && h.avgScore >= 70 ? "good" : "warn"}>
              {h.halaqahName}: {h.avgScore}٪ ({h.visits})
            </Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

/** لينك واحد يشاركه المدير مع المعلّمين: كل معلّم يفتحه من تطبيقه ويضغط "انضم" فتُضاف حلقته تلقائياً */
function TeacherJoinLinkCard({ mosqueId }: { mosqueId: number }) {
  const [link, setLink] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/mosques/${mosqueId}/teacher-join-link`)
      .then(async (res) => {
        const d = (await res.json().catch(() => ({}))) as { link?: string; error?: string };
        if (res.ok && d.link) setLink(d.link);
        else {
          setLink(null);
          setError(d.error ?? "تعذّر جلب الرابط");
        }
      })
      .catch(() => {
        setLink(null);
        setError("تعذّر جلب الرابط");
      });
  }, [mosqueId]);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // الرابط ظاهر بالحقل ويمكن نسخه يدوياً
    }
  }

  async function rotate() {
    if (!window.confirm("تجديد الرابط يوقف الرابط الحالي فوراً، وكل من لم ينضم بعد يحتاج الرابط الجديد. متأكد؟")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mosques/${mosqueId}/teacher-join-link`, { method: "POST" });
      const d = (await res.json().catch(() => ({}))) as { link?: string; error?: string };
      if (!res.ok || !d.link) {
        setError(d.error ?? "تعذّر التجديد");
        return;
      }
      setLink(d.link);
    } finally {
      setBusy(false);
    }
  }

  const whatsappHref = link
    ? `https://wa.me/?text=${encodeURIComponent(`السلام عليكم، لإضافة حلقتك إلى الجامع افتح الرابط من تطبيق الحلقة واضغط "انضم":
${link}`)}`
    : undefined;

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <LinkIcon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">رابط انضمام المعلّمين</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        شارك هذا الرابط مع معلّمي الجامع — يفتحه كل معلّم (مشرف حلقته) ويضغط «انضم» فتُضاف حلقته هنا تلقائياً.
      </p>
      {link === undefined ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : link ? (
        <>
          <input
            readOnly
            dir="ltr"
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-muted-foreground"
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy}>{copied ? "نُسخ ✓" : "نسخ"}</Button>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-xl border border-border px-3 py-2 text-sm font-medium text-primary hover:bg-muted/50"
            >
              مشاركة واتساب
            </a>
            <Button variant="ghost" onClick={rotate} disabled={busy}>
              {busy ? "لحظة…" : "تجديد الرابط"}
            </Button>
          </div>
        </>
      ) : null}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

function PendingRow({
  pending,
  halaqahs,
  onAssigned,
}: {
  pending: Pending;
  halaqahs: Halaqah[];
  onAssigned: () => void;
}) {
  const [halaqahId, setHalaqahId] = useState<string>(String(halaqahs[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: pending.id, halaqahId: Number(halaqahId) }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(d.error ?? "تعذّر التوزيع");
        return;
      }
      onAssigned();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">
              {pending.name} {pending.status === "waitlisted" && <Badge tone="warn">بالانتظار</Badge>}
            </p>
            {pending.phone && <p className="tabular text-xs text-muted-foreground">{pending.phone}</p>}
          </div>
          {pending.status === "assigned" ? (
            <Badge tone="good">مُوزَّع</Badge>
          ) : halaqahs.length === 0 ? (
            <Badge tone="warn">أضف حلقة أولاً</Badge>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={halaqahId}
                onChange={(e) => setHalaqahId(e.target.value)}
                className="rounded-xl border border-border bg-background px-2 py-1.5 text-sm"
              >
                {halaqahs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.halaqahName}
                  </option>
                ))}
              </select>
              <Button onClick={assign} disabled={busy}>
                {busy ? "لحظة…" : "توزيع"}
              </Button>
            </div>
          )}
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </Card>
    </li>
  );
}

/** يظهر للمشرف العام فقط — ينشئ/يعيد ضبط حساب مدير هذا الجامع تحديداً */
function MosqueAdminAccountCard({ mosqueId }: { mosqueId: number }) {
  const [existing, setExisting] = useState<{ username: string } | null | undefined>(undefined);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`/api/mosques/${mosqueId}/admin-account`)
      .then((res) => (res.ok ? res.json() : { admin: null }))
      .then((d: { admin: { username: string } | null }) => setExisting(d.admin))
      .catch(() => setExisting(null));
  }, [mosqueId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/mosques/${mosqueId}/admin-account`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; username?: string };
      if (!res.ok) {
        setError(d.error ?? "تعذّر الحفظ");
        return;
      }
      setExisting({ username: d.username ?? username });
      setPassword("");
      setSaved(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldIcon className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">حساب مدير الجامع</h2>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        يقدر يدير حلقات هذا الجامع وطلابه بنفسه (رابط دخوله: <span className="tabular">/mosque-login</span>) —
        بلا حاجة لك.
        {existing && (
          <>
            {" "}
            حالياً: <span className="font-semibold text-foreground">{existing.username}</span>
          </>
        )}
      </p>
      <form onSubmit={submit} className="grid gap-2 sm:grid-cols-3">
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="اسم مستخدم جديد"
          required
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="كلمة مرور (٨ أحرف فأكثر)"
          minLength={8}
          required
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "لحظة…" : existing ? "استبدال" : "إنشاء"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {saved && <p className="mt-2 text-sm text-success">تم الحفظ ✓</p>}
    </Card>
  );
}

type Stats = {
  halaqahCount: number;
  unreachableCount: number;
  totalActiveStudents: number;
  totalPages: number;
  avgMastery: number;
  perHalaqah: {
    id: number;
    halaqahName: string;
    teacherName: string;
    stats: { activeStudents: number; totalPages: number; avgPages: number; avgMastery: number } | null;
  }[];
};

/** يفتح نموذج «إضافة يدوية» للحلقات وينزل إليه — زر الخطوة التالية بحالة الفراغ */
function openManualAdd() {
  const details = document.getElementById("add-halaqah");
  if (details instanceof HTMLDetailsElement) {
    details.open = true;
    details.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

/**
 * اللوحة الحقيقية — أرقام حية من قاعدة الحلقات (لا بيانات مخزّنة هنا)،
 * تُحدَّث كل ما فُتحت الصفحة. حلقة يفشل استعلامها تظهر بشارة بدل
 * ما تكسر الإجمالي.
 */
function MosqueStatsSection({ mosqueId }: { mosqueId: number }) {
  const [stats, setStats] = useState<Stats | null | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/mosques/${mosqueId}/stats`)
      .then((res) => (res.ok ? res.json() : null))
      .then(setStats)
      .catch(() => setStats(null));
  }, [mosqueId]);

  if (stats === undefined) return <Empty title="جارٍ حساب الإحصائيات…" />;
  if (!stats || stats.halaqahCount === 0) {
    return (
      <Empty
        title="ما فيه حلقات مضافة بعد — الإحصائيات تظهر بعد إضافة أول حلقة."
        action={
          <Button variant="ghost" onClick={openManualAdd} className="text-sm">
            أضف حلقة
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="الحلقات" value={stats.halaqahCount} icon={<BookIcon className="h-4 w-4" />} tone="primary" />
        <Stat
          label="الطلاب النشطون"
          value={stats.totalActiveStudents}
          hint="بكل حلقات الجامع"
          icon={<UsersIcon className="h-4 w-4" />}
        />
        <Stat
          label="متوسط الإتقان"
          value={`${stats.avgMastery}٪`}
          hint="محسوب من التسميعات"
          icon={<TrendUpIcon className="h-4 w-4" />}
        />
        <Stat
          label="إجمالي المحفوظ"
          value={stats.totalPages.toLocaleString("en")}
          hint="صفحة بالجامع كله"
          icon={<BookIcon className="h-4 w-4" />}
        />
      </div>
      {stats.unreachableCount > 0 && (
        <p className="text-xs text-accent-ink">
          تعذّر جلب إحصائيات {stats.unreachableCount} حلقة مؤقتاً — الإجمالي أعلاه يستثنيها.
        </p>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-right text-sm">
          <thead className="border-b border-border bg-muted/50">
            <tr className="text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">الحلقة</th>
              <th className="px-3 py-2 font-medium">المعلّم</th>
              <th className="px-3 py-2 font-medium">الطلاب</th>
              <th className="px-3 py-2 font-medium">متوسط الإتقان</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {stats.perHalaqah.map((h) => (
              <tr key={h.id} className="transition-colors duration-200 hover:bg-muted/40">
                <td className="px-3 py-2 font-medium">
                  <Link href={`/mosque/${mosqueId}/halaqah/${h.id}`} className="text-accent-ink hover:underline">
                    {h.halaqahName}
                  </Link>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{h.teacherName}</td>
                {h.stats ? (
                  <>
                    <td className="tabular px-3 py-2">{h.stats.activeStudents}</td>
                    <td className="px-3 py-2">
                      <Badge tone={h.stats.avgMastery >= 75 ? "good" : h.stats.avgMastery >= 55 ? "neutral" : "warn"}>
                        {h.stats.avgMastery}٪
                      </Badge>
                    </td>
                  </>
                ) : (
                  <td className="px-3 py-2" colSpan={2}>
                    <Badge tone="warn">غير متاح حالياً</Badge>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
