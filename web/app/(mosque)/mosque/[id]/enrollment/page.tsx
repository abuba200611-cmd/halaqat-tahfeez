"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Button, Card, Empty, Stat } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { callApi, useApi } from "@/components/mosque/use-api";
import { LEVELS, LEVEL_LABELS, occupancyRatio, type Level } from "@/lib/enrollment";
import { LEGACY_STAGE_LABEL_AR, STAGES, STAGE_LABEL_AR, type HalaqahStage } from "@/lib/halaqah-stage";

/*
  التوزيع الآلي وقائمة الانتظار لمدير الجامع: سعة كل حلقة ومعاييرها مع شريط إشغال،
  قائمة الانتظار (ترتيب ← إسناد يدوي ← إزالة)، وسجل النشاط. الإسناد اليدوي يتجاوز
  السعة عمداً (قرار المدير) عبر /api/assign الموجود.
*/

type Halaqah = {
  id: number;
  name: string;
  teacherName: string;
  capacity: number | null;
  count: number;
  minAge: number | null;
  maxAge: number | null;
  level: Level | null;
  stage: HalaqahStage | null;
};
type WaitItem = {
  id: number;
  name: string;
  phone: string;
  birthYear: number | null;
  level: Level | null;
  position: number;
};
type Activity = { id: number; kind: string; message: string; createdAt: string; read: boolean };
type Overview = { halaqahs: Halaqah[]; waitlist: WaitItem[]; activity: Activity[]; unread: number };

export default function EnrollmentPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  const base = `/api/mosques/${mosqueId}`;
  const { data, status, loading, reload } = useApi<Overview>(`${base}/enrollment`);
  const [notice, setNotice] = useState<string | null>(null);

  async function runPending() {
    const res = await callApi<{ assigned: number; waitlisted: number }>(`${base}/enrollment`, "POST", { action: "run" });
    setNotice(res.ok ? `وُزّع ${res.data?.assigned ?? 0} · انتقل ${res.data?.waitlisted ?? 0} إلى الانتظار` : (res.error ?? "تعذّر التنفيذ"));
    reload();
  }

  async function markRead() {
    await callApi(`${base}/enrollment`, "POST", { action: "mark_read" });
    reload();
  }

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/enrollment`} title="التوزيع الآلي وقائمة الانتظار">
      {!data && <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="التوزيع الآلي" />}
      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Stat label="بقائمة الانتظار" value={data.waitlist.length} tone={data.waitlist.length > 0 ? "primary" : "surface"} />
            <Stat
              label="المقاعد الشاغرة"
              value={data.halaqahs.some((h) => h.capacity === null) ? "مفتوحة" : data.halaqahs.reduce((sum, h) => sum + Math.max(0, (h.capacity ?? 0) - h.count), 0)}
              hint="حسب سعة الحلقات"
            />
            <Stat label="إشعارات جديدة" value={data.unread} />
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-bold">الحلقات والسعة</h2>
              <Button variant="ghost" onClick={runPending}>
                وزّع المعلّقين الآن
              </Button>
            </div>
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            {data.halaqahs.length === 0 ? (
              <Empty title="لا حلقات في هذا الجامع بعد." />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {data.halaqahs.map((h) => (
                  <HalaqahCard key={`${h.id}:${h.capacity}:${h.minAge}:${h.maxAge}:${h.level}:${h.stage}`} base={base} halaqah={h} onSaved={reload} />
                ))}
              </div>
            )}
          </section>

          <WaitlistSection base={base} mosqueId={mosqueId} items={data.waitlist} halaqahs={data.halaqahs} onChanged={reload} />

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">النشاط</h2>
              {data.unread > 0 && (
                <Button variant="ghost" onClick={markRead}>
                  تعليم الكل كمقروء
                </Button>
              )}
            </div>
            {data.activity.length === 0 ? (
              <Empty title="لا نشاط بعد." />
            ) : (
              <Card className="divide-y divide-border">
                {data.activity.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                    <span className={a.read ? "text-muted-foreground" : "font-medium"}>{a.message}</span>
                    <span className="tabular shrink-0 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("ar-SA")}</span>
                  </div>
                ))}
              </Card>
            )}
          </section>
        </div>
      )}
    </MosquePage>
  );
}

function OccupancyBar({ halaqah }: { halaqah: Halaqah }) {
  const ratio = occupancyRatio(halaqah);
  const pct = ratio === null ? 0 : Math.min(100, Math.round(ratio * 100));
  const full = ratio !== null && ratio >= 1;
  const near = ratio !== null && ratio >= 0.8;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="tabular text-muted-foreground">
          {halaqah.count}
          {halaqah.capacity !== null ? ` / ${halaqah.capacity}` : " طالباً · بلا حد"}
        </span>
        {full && <Badge tone="warn">ممتلئة</Badge>}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`إشغال حلقة ${halaqah.name}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-200 ${full ? "bg-destructive" : near ? "bg-accent" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function HalaqahCard({ base, halaqah, onSaved }: { base: string; halaqah: Halaqah; onSaved: () => void }) {
  const [capacity, setCapacity] = useState(halaqah.capacity?.toString() ?? "");
  const [minAge, setMinAge] = useState(halaqah.minAge?.toString() ?? "");
  const [maxAge, setMaxAge] = useState(halaqah.maxAge?.toString() ?? "");
  const [level, setLevel] = useState<string>(halaqah.level ?? "");
  const [stage, setStage] = useState<string>(halaqah.stage ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // فئة الحلقة العمرية (001 T021): تُحفَظ فوراً بمسارها الخاص — تتغيّر نادراً
  // ولا تُخلط بمعايير السعة/العمر. الحلقة بلا فئة = «افتراضي» (النمط الحالي).
  async function changeStage(next: string) {
    const previous = stage;
    setStage(next);
    setBusy(true);
    setMessage(null);
    const res = await callApi(`${base}/halaqahs/${halaqah.id}/stage`, "PATCH", { stage: next || null });
    setBusy(false);
    if (!res.ok) {
      setStage(previous);
      setMessage(res.error ?? "تعذّر حفظ الفئة");
      return;
    }
    setMessage("حُفظت الفئة");
    onSaved();
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    const res = await callApi<{ promoted: number }>(`${base}/enrollment/halaqahs/${halaqah.id}`, "PUT", {
      capacity: capacity.trim() || null,
      minAge: minAge.trim() || null,
      maxAge: maxAge.trim() || null,
      level: level || null,
    });
    setBusy(false);
    if (!res.ok) {
      setMessage(res.error ?? "تعذّر الحفظ");
      return;
    }
    setMessage(res.data?.promoted ? `حُفظ · رُقّي ${res.data.promoted} من الانتظار` : "حُفظ");
    onSaved();
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <div className="font-semibold">{halaqah.name}</div>
        {halaqah.teacherName && <div className="text-xs text-muted-foreground">{halaqah.teacherName}</div>}
      </div>
      <OccupancyBar halaqah={halaqah} />
      <label className="block text-xs text-muted-foreground">
        الفئة العمرية
        <select value={stage} onChange={(e) => changeStage(e.target.value)} disabled={busy} className={`${inputClass} mt-1`}>
          <option value="">{LEGACY_STAGE_LABEL_AR}</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL_AR[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="block text-xs text-muted-foreground">
          السعة
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} inputMode="numeric" placeholder="بلا حد" className={`${inputClass} mt-1`} />
        </label>
        <label className="block text-xs text-muted-foreground">
          أقل عمر
          <input value={minAge} onChange={(e) => setMinAge(e.target.value)} inputMode="numeric" placeholder="أي" className={`${inputClass} mt-1`} />
        </label>
        <label className="block text-xs text-muted-foreground">
          أكبر عمر
          <input value={maxAge} onChange={(e) => setMaxAge(e.target.value)} inputMode="numeric" placeholder="أي" className={`${inputClass} mt-1`} />
        </label>
        <label className="block text-xs text-muted-foreground">
          المستوى
          <select value={level} onChange={(e) => setLevel(e.target.value)} className={`${inputClass} mt-1`}>
            <option value="">أي مستوى</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy}>
          {busy ? "جارٍ الحفظ…" : "حفظ"}
        </Button>
        {message && <span className="text-xs text-muted-foreground">{message}</span>}
      </div>
    </Card>
  );
}

function WaitlistSection({
  base,
  mosqueId,
  items,
  halaqahs,
  onChanged,
}: {
  base: string;
  mosqueId: number;
  items: WaitItem[];
  halaqahs: Halaqah[];
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);

  async function move(id: number, direction: "up" | "down") {
    const res = await callApi(`${base}/waitlist/${id}`, "POST", { action: "move", direction });
    setError(res.ok ? null : (res.error ?? "تعذّر التحريك"));
    onChanged();
  }
  async function remove(item: WaitItem) {
    if (!confirm(`إزالة «${item.name}» من قائمة الانتظار؟`)) return;
    const res = await callApi(`${base}/waitlist/${item.id}`, "DELETE");
    setError(res.ok ? null : (res.error ?? "تعذّرت الإزالة"));
    onChanged();
  }

  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-bold">قائمة الانتظار ({items.length})</h2>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {items.length === 0 ? (
        <Empty title="لا أحد بالانتظار." />
      ) : (
        <Card className="divide-y divide-border">
          {items.map((item, index) => (
            <WaitRow
              key={item.id}
              item={item}
              mosqueId={mosqueId}
              halaqahs={halaqahs}
              isFirst={index === 0}
              isLast={index === items.length - 1}
              onMove={move}
              onRemove={remove}
              onAssigned={onChanged}
            />
          ))}
        </Card>
      )}
    </section>
  );
}

function WaitRow({
  item,
  halaqahs,
  isFirst,
  isLast,
  onMove,
  onRemove,
  onAssigned,
}: {
  item: WaitItem;
  mosqueId: number;
  halaqahs: Halaqah[];
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: number, direction: "up" | "down") => void;
  onRemove: (item: WaitItem) => void;
  onAssigned: () => void;
}) {
  const [halaqahId, setHalaqahId] = useState(String(halaqahs[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    setBusy(true);
    setError(null);
    const res = await callApi("/api/assign", "POST", { registrationId: item.id, halaqahId: Number(halaqahId) });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "تعذّر التوزيع");
    else onAssigned();
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
      <Badge tone="warn">{item.position}</Badge>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{item.name}</div>
        <div className="tabular text-xs text-muted-foreground">
          {[item.phone, item.birthYear ? `مواليد ${item.birthYear}` : null, item.level ? LEVEL_LABELS[item.level] : null].filter(Boolean).join(" · ") || "—"}
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" onClick={() => onMove(item.id, "up")} disabled={isFirst} aria-label="تقديم">
          ↑
        </Button>
        <Button variant="ghost" onClick={() => onMove(item.id, "down")} disabled={isLast} aria-label="تأخير">
          ↓
        </Button>
      </div>
      {halaqahs.length > 0 && (
        <div className="flex items-center gap-2">
          <select value={halaqahId} onChange={(e) => setHalaqahId(e.target.value)} className={`${inputClass} w-auto`} aria-label="الحلقة">
            {halaqahs.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {h.capacity !== null && h.count >= h.capacity ? " (ممتلئة)" : ""}
              </option>
            ))}
          </select>
          <Button onClick={assign} disabled={busy}>
            {busy ? "…" : "وزّع"}
          </Button>
        </div>
      )}
      <Button variant="danger" onClick={() => onRemove(item)}>
        إزالة
      </Button>
    </div>
  );
}
