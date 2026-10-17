"use client";

import { useState } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { DevAssociationCard } from "@/app/api/dev/associations/route";

/*
  A3 — إدارة الجمعيات: إنشاء جمعية، إسناد الجوامع إليها أو فكّها، وحسابات
  مديري الجمعيات (إنشاء + إعادة تعيين كلمة المرور التي تُبطل جلساتهم).
  مدير الجمعية يقرأ جوامعه فقط ولا يعدّل بياناتها.
*/

type Data = {
  associations: DevAssociationCard[];
  mosques: { id: number; name: string; city: string; associationId: number | null }[];
};

const inputClass =
  "w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function DevAssociationsPage() {
  const { data, loading, reload } = useApi<Data>("/api/dev/associations");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-naskh text-2xl font-bold">الجمعيات</h1>
        <p className="text-sm text-muted-foreground">
          جمعيات تجمع عدة جوامع، ولكل جمعية مدير يقرأ مؤشرات جوامعه وتقاريرها (قراءة فقط) من{" "}
          <span dir="ltr">/association</span>.
        </p>
      </div>
      <CreateCard onCreated={reload} />
      {loading && !data && <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>}
      {data?.associations.map((a) => <AssociationRow key={a.id} association={a} mosques={data.mosques} onChanged={reload} />)}
    </div>
  );
}

function CreateCard({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await callApi("/api/dev/associations", "POST", { action: "create", name, city });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setName("");
      setCity("");
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">إضافة جمعية</h2>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الجمعية" required className={inputClass} />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="المدينة (اختياري)" className={inputClass} />
        <Button type="submit" disabled={busy}>
          {busy ? "لحظة…" : "إضافة"}
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}

function AssociationRow({
  association,
  mosques,
  onChanged,
}: {
  association: DevAssociationCard;
  mosques: Data["mosques"];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function call(body: Record<string, unknown>, okNote?: string): Promise<boolean> {
    setError(null);
    setNote(null);
    const result = await callApi("/api/dev/associations", "POST", body);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    if (okNote) setNote(okNote);
    onChanged();
    return true;
  }

  const assignable = mosques.filter((m) => m.associationId !== association.id);

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)} className="cursor-pointer text-right">
          <p className="font-semibold">
            {association.name} <span className="text-xs font-normal text-muted-foreground">#{association.id}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {association.city ? `${association.city} · ` : ""}
            {association.mosques.length} جامع · {association.admins.length} مدير
          </p>
        </button>
        <Button variant="ghost" type="button" onClick={() => setOpen((v) => !v)}>
          {open ? "إخفاء" : "التفاصيل"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {note && <p className="text-sm text-primary">{note}</p>}

          <div>
            <h3 className="mb-2 text-sm font-semibold">الجوامع</h3>
            {association.mosques.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا جوامع مسندة بعد.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {association.mosques.map((m) => (
                  <li key={m.id} className="flex items-center gap-1">
                    <Badge>{m.name}</Badge>
                    <button
                      type="button"
                      className="cursor-pointer text-xs text-destructive hover:underline"
                      onClick={() => call({ action: "assign", mosqueId: m.id, associationId: null })}
                    >
                      فكّ
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <AssignForm
              mosques={assignable}
              onAssign={(mosqueId) => call({ action: "assign", mosqueId, associationId: association.id })}
            />
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold">مديرو الجمعية</h3>
            <ul className="mb-3 space-y-2">
              {association.admins.map((admin) => (
                <ResetRow key={admin.id} admin={admin} onReset={(password) => call({ action: "reset_password", adminId: admin.id, password }, "تم تغيير كلمة المرور وإبطال الجلسات.")} />
              ))}
            </ul>
            <CreateAdminForm onCreate={(username, password) => call({ action: "create_admin", associationId: association.id, username, password }, "أُنشئ الحساب.")} />
          </div>

          <div className="flex gap-2 border-t border-border pt-3">
            <Button
              variant="danger"
              type="button"
              onClick={() => {
                if (window.confirm(`حذف «${association.name}»؟ تُفَكّ جوامعها وتُحذف حسابات مديريها.`)) {
                  void call({ action: "delete", id: association.id });
                }
              }}
            >
              حذف الجمعية
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AssignForm({ mosques, onAssign }: { mosques: Data["mosques"]; onAssign: (mosqueId: number) => Promise<boolean> }) {
  const [value, setValue] = useState("");
  if (mosques.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <select value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} max-w-xs`}>
        <option value="">اختر جامعاً لإسناده…</option>
        {mosques.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
            {m.associationId !== null ? " (تابع لجمعية أخرى)" : ""}
          </option>
        ))}
      </select>
      <Button
        type="button"
        disabled={value === ""}
        onClick={async () => {
          if (await onAssign(Number(value))) setValue("");
        }}
      >
        إسناد
      </Button>
    </div>
  );
}

function ResetRow({ admin, onReset }: { admin: { id: number; username: string }; onReset: (password: string) => Promise<boolean> }) {
  const [password, setPassword] = useState("");
  return (
    <li className="flex flex-wrap items-center gap-2 text-sm">
      <span dir="ltr" className="font-mono">{admin.username}</span>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="كلمة مرور جديدة (٨+)"
        dir="ltr"
        className={`${inputClass} max-w-[14rem]`}
      />
      <Button
        variant="ghost"
        type="button"
        disabled={password.length < 8}
        onClick={async () => {
          if (await onReset(password)) setPassword("");
        }}
      >
        إعادة تعيين
      </Button>
    </li>
  );
}

function CreateAdminForm({ onCreate }: { onCreate: (username: string, password: string) => Promise<boolean> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (await onCreate(username, password)) {
        setUsername("");
        setPassword("");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3">
      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="اسم المستخدم" required dir="ltr" className={inputClass} />
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="كلمة المرور (٨+)" required dir="ltr" className={inputClass} />
      <Button type="submit" disabled={busy}>
        {busy ? "لحظة…" : "إنشاء مدير"}
      </Button>
    </form>
  );
}
