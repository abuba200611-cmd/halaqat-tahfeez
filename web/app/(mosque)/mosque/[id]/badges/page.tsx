"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Badge as UiBadge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { MemberPicker } from "@/components/mosque/member-picker";
import { callApi, useApi } from "@/components/mosque/use-api";
import { formatWeek } from "@/lib/mosque/evaluation";
import type { Badge, BadgeAward, BadgeTargetKind, MosqueMember, MosqueRegistration } from "@/lib/mosque/db";

type BadgesData = {
  badges: Badge[];
  recentAwards: BadgeAward[];
  families: { id: number; name: string }[];
};
type Directory = { students: MosqueRegistration[]; members: MosqueMember[] };

const KIND_LABEL: Record<BadgeTargetKind, string> = { student: "طالب", family: "أسرة", member: "عضو" };

/** الأوسمة: تعريفها، منحها للطلاب والأسر والأعضاء، وآخر المنح */
export default function BadgesPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/badges`} title="الأوسمة">
      <BadgesSection mosqueId={mosqueId} />
    </MosquePage>
  );
}

function BadgesSection({ mosqueId }: { mosqueId: number }) {
  const base = `/api/mosques/${mosqueId}/badges`;
  const { data, status, loading, reload } = useApi<BadgesData>(base);

  if (!data) return <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الأوسمة" />;

  return (
    <div className="space-y-5">
      <DefineCard base={base} onSaved={reload} />

      {data.badges.length === 0 ? (
        <Empty title="لا أوسمة بعد — أضف أول وسام أو استخدم الاقتراحات." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.badges.map((badge) => (
            <BadgeCard key={badge.id} base={base} badge={badge} onSaved={reload} />
          ))}
        </div>
      )}

      {data.badges.length > 0 && (
        <AwardCard mosqueId={mosqueId} base={base} badges={data.badges} families={data.families} onSaved={reload} />
      )}

      <TargetBadgesCard mosqueId={mosqueId} families={data.families} />

      <RecentAwards awards={data.recentAwards} />
    </div>
  );
}

function DefineCard({ base, onSaved }: { base: string; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏅");
  const [description, setDescription] = useState("");
  const [criteriaNote, setCriteriaNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await callApi(base, "POST", { name, icon, description, criteriaNote });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setName("");
    setIcon("🏅");
    setDescription("");
    setCriteriaNote("");
    onSaved();
  }

  async function seed() {
    setBusy(true);
    setError(null);
    const result = await callApi(`${base}/suggested`, "POST");
    setBusy(false);
    if (!result.ok) setError(result.error);
    onSaved();
  }

  return (
    <Card className="space-y-3 p-4">
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-[5rem_1fr_auto] sm:items-end">
        <label className="block text-xs text-muted-foreground">
          الأيقونة
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            maxLength={16}
            className={`${inputClass} mt-1 text-center text-xl`}
            aria-label="أيقونة الوسام"
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          اسم الوسام
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
            placeholder="مثال: نجم الأسبوع"
            className={`${inputClass} mt-1`}
          />
        </label>
        <Button type="submit" disabled={busy || !name.trim()}>
          إضافة وسام
        </Button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted-foreground">
          الوصف (اختياري)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          ضابط المنح (اختياري)
          <input
            value={criteriaNote}
            onChange={(e) => setCriteriaNote(e.target.value)}
            maxLength={300}
            placeholder="متى يُمنح هذا الوسام؟"
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <Button variant="ghost" onClick={seed} disabled={busy}>
          اقتراح الأوسمة الأساسية
        </Button>
        <span className="text-xs text-muted-foreground">
          🏅 المتميز، 📖 الحافظ المتقن، ⏰ الملتزم بالحضور، 🤝 المبادر، ⭐ نجم الأسبوع — تُضاف الناقصة فقط.
        </span>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

function BadgeCard({ base, badge, onSaved }: { base: string; badge: Badge; onSaved: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm(`حذف «${badge.name}»؟ تُحذف كل مرات منحه ولا يمكن التراجع.`)) return;
    const result = await callApi(`${base}/${badge.id}`, "DELETE");
    if (!result.ok) setError(result.error);
    else onSaved();
  }

  return (
    <Card className="space-y-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">
          <span className="me-1 text-xl">{badge.icon}</span>
          {badge.name}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <UiBadge tone="good">{badge.awardCount} منح</UiBadge>
          <Button variant="danger" className="!px-3 !py-1 text-xs" onClick={remove}>
            حذف
          </Button>
        </div>
      </div>
      {badge.description && <p className="text-sm">{badge.description}</p>}
      {badge.criteriaNote && (
        <p className="text-xs text-muted-foreground">الضابط: {badge.criteriaNote}</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

/** منح وسام: اختر الوسام والتاريخ والملاحظة، ثم الهدف — فرداً بمنتقي الأفراد أو أسرة بقائمة الأسر */
function AwardCard({
  mosqueId,
  base,
  badges,
  families,
  onSaved,
}: {
  mosqueId: number;
  base: string;
  badges: Badge[];
  families: { id: number; name: string }[];
  onSaved: () => void;
}) {
  const [badgeId, setBadgeId] = useState(String(badges[0]?.id ?? ""));
  const [awardedAt, setAwardedAt] = useState(() => formatWeek(new Date()));
  const [note, setNote] = useState("");
  const [familyId, setFamilyId] = useState(String(families[0]?.id ?? ""));
  const [tab, setTab] = useState<"individual" | "family">("individual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMessage, setOkMessage] = useState<string | null>(null);

  async function award(kind: BadgeTargetKind, targetId: number) {
    const badge = badges.find((b) => String(b.id) === badgeId);
    if (!badge) {
      setError("اختر وساماً أولاً.");
      return "اختر وساماً أولاً.";
    }
    setBusy(true);
    setError(null);
    setOkMessage(null);
    const result = await callApi<{ award: BadgeAward }>(`${base}/${badge.id}/awards`, "POST", {
      targetKind: kind,
      targetId,
      awardedAt,
      note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return result.error ?? "تعذّر المنح";
    }
    setOkMessage(`مُنح «${badge.icon} ${badge.name}» لـ${result.data?.award.targetName ?? "الهدف"} ✓`);
    onSaved();
    return null;
  }

  async function awardFamily() {
    if (familyId) await award("family", Number(familyId));
  }

  return (
    <Card className="space-y-4 p-4">
      <h3 className="font-semibold">منح وسام</h3>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs text-muted-foreground">
          الوسام
          <select value={badgeId} onChange={(e) => setBadgeId(e.target.value)} className={`${inputClass} mt-1`}>
            {badges.map((badge) => (
              <option key={badge.id} value={badge.id}>
                {badge.icon} {badge.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted-foreground">
          تاريخ المنح
          <input
            type="date"
            value={awardedAt}
            onChange={(e) => setAwardedAt(e.target.value)}
            className={`${inputClass} tabular mt-1`}
          />
        </label>
        <label className="block text-xs text-muted-foreground">
          ملاحظة (اختياري)
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>

      <div className="flex gap-1 rounded-full bg-muted p-1 sm:w-fit">
        {(["individual", "family"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={`cursor-pointer rounded-full px-4 py-1 text-sm transition-colors duration-200 ${
              tab === value ? "bg-surface font-semibold shadow-sm" : "text-muted-foreground"
            }`}
          >
            {value === "individual" ? "طالب / عضو" : "أسرة"}
          </button>
        ))}
      </div>

      {tab === "individual" ? (
        <MemberPicker mosqueId={mosqueId} existing={new Set()} onAdd={(kind, memberId) => award(kind, memberId)} />
      ) : families.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          لا توجد أسر — ميزة الأسر يجب أن تكون مفعّلة وتحتوي أسراً لمنح أوسمتها.
        </p>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <select value={familyId} onChange={(e) => setFamilyId(e.target.value)} className={`${inputClass} sm:flex-1`} aria-label="الأسرة">
            {families.map((family) => (
              <option key={family.id} value={family.id}>
                {family.name}
              </option>
            ))}
          </select>
          <Button onClick={awardFamily} disabled={busy || !familyId || !badgeId}>
            منح الوسام
          </Button>
        </div>
      )}

      {okMessage && <p className="text-sm text-success">{okMessage}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </Card>
  );
}

/** أوسمة هدف واحد: اختر نوع الهدف ثم الهدف فتُعرض أوسامه كلها */
function TargetBadgesCard({ mosqueId, families }: { mosqueId: number; families: { id: number; name: string }[] }) {
  const { data: directory } = useApi<Directory>(`/api/mosques/${mosqueId}/members`);
  const [kind, setKind] = useState<BadgeTargetKind>("student");
  const [target, setTarget] = useState("");

  const { data, loading } = useApi<{ target: { name: string }; targetAwards: BadgeAward[] }>(
    target ? `/api/mosques/${mosqueId}/badges?kind=${kind}&targetId=${target}` : null,
  );

  const options =
    kind === "family" ? families : kind === "student" ? (directory?.students ?? []) : (directory?.members ?? []);

  return (
    <Card className="space-y-3 p-4">
      <h3 className="font-semibold">أوسمة هدف</h3>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as BadgeTargetKind);
            setTarget("");
          }}
          className={`${inputClass} sm:w-36`}
          aria-label="نوع الهدف"
        >
          <option value="student">طالب</option>
          <option value="member">عضو</option>
          {families.length > 0 && <option value="family">أسرة</option>}
        </select>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className={`${inputClass} sm:flex-1`}
          aria-label="الهدف"
        >
          <option value="">اختر {KIND_LABEL[kind]}…</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      {!target ? (
        <p className="text-sm text-muted-foreground">اختر هدفاً لعرض كل أوسمه.</p>
      ) : loading || !data ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : data.targetAwards.length === 0 ? (
        <p className="text-sm text-muted-foreground">لا أوسمة لـ{data.target.name} بعد.</p>
      ) : (
        <ul className="divide-y divide-border">
          {data.targetAwards.map((award) => (
            <li key={award.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-sm">
                <span className="me-1">{award.icon}</span>
                <span className="font-medium">{award.badgeName}</span>
              </span>
              <span className="tabular text-xs text-muted-foreground">
                {award.awardedAt}
                {award.note && <span className="ms-2">{award.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RecentAwards({ awards }: { awards: BadgeAward[] }) {
  return (
    <Card className="p-4">
      <h3 className="mb-3 font-semibold">آخر الأوسمة الممنوحة</h3>
      {awards.length === 0 ? (
        <p className="text-sm text-muted-foreground">لم تُمنح أوسمة بعد.</p>
      ) : (
        <ul className="divide-y divide-border">
          {awards.map((award) => (
            <li key={award.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="min-w-0 text-sm">
                <span className="me-1">{award.icon}</span>
                <span className="font-medium">{award.badgeName}</span>
                <span className="mx-1 text-muted-foreground">←</span>
                {award.targetName}
                <UiBadge>{KIND_LABEL[award.targetKind]}</UiBadge>
              </span>
              <span className="tabular text-xs text-muted-foreground">
                {award.awardedAt}
                {award.note && <span className="ms-2">{award.note}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
