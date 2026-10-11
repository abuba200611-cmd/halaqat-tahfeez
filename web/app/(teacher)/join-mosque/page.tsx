"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Card, Empty } from "@/components/ui";

/*
  يفتحه المعلّم من رابط يشاركه مدير الجامع. يقع تحت (teacher) فيمرّ بـAuthGate:
  غير المسجّل يرى شاشة الدخول بنفس الرابط، وبعد الدخول تظهر هذي الصفحة مباشرة.
*/
export default function JoinMosquePage() {
  return (
    <Suspense>
      <JoinMosque />
    </Suspense>
  );
}

type Preview = { role: "supervisor" | "assistant"; halaqahName: string; mosqueName?: string; city?: string };

function JoinMosque() {
  const code = useSearchParams().get("code")?.trim() ?? "";
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const [busy, setBusy] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [done, setDone] = useState<{ mosqueName: string; alreadyJoined: boolean } | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    fetch(`/api/teacher/join-mosque?code=${encodeURIComponent(code)}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as Preview & { error?: string };
        if (cancelled) return;
        if (!res.ok) setLoadError(data.error ?? "تعذّر فتح رابط الانضمام");
        else setPreview(data);
      })
      .catch(() => {
        if (!cancelled) setLoadError("تعذّر الاتصال، حاول لاحقاً");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  async function join() {
    setBusy(true);
    setJoinError(null);
    try {
      const res = await fetch("/api/teacher/join-mosque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        mosqueName?: string;
        alreadyJoined?: boolean;
      };
      if (!res.ok) {
        setJoinError(data.error ?? "تعذّر الانضمام");
        return;
      }
      setDone({ mosqueName: data.mosqueName ?? preview?.mosqueName ?? "", alreadyJoined: data.alreadyJoined === true });
    } finally {
      setBusy(false);
    }
  }

  if (!code) return <Empty title="رابط الانضمام ناقص — اطلب الرابط من مدير الجامع." />;
  if (loading) return <Empty title="جارٍ فتح الرابط…" />;
  if (loadError) return <Empty title={loadError} />;
  if (!preview) return null;

  if (preview.role !== "supervisor") {
    return (
      <Card className="mx-auto max-w-lg p-5 text-center">
        <p className="text-sm">اطلب من مشرف الحلقة أن يفتح هذا الرابط وينضم بحلقته.</p>
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-lg p-5 text-center">
        <p className="font-semibold text-success">
          {done.alreadyJoined ? `حلقتك مضافة سابقاً إلى جامع ${done.mosqueName}` : `تمت إضافة حلقتك إلى جامع ${done.mosqueName}`}
        </p>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg space-y-4 p-5">
      <h1 className="font-naskh text-xl font-bold">
        انضمام حلقتك «{preview.halaqahName}» إلى جامع «{preview.mosqueName}»
        {preview.city ? ` — ${preview.city}` : ""}
      </h1>
      <p className="text-sm text-muted-foreground">
        بعد الانضمام يرى مدير الجامع إحصائيات حلقتك (عدد الطلاب النشطين والمحفوظ والإتقان) وقائمة طلابك بأسمائهم.
      </p>
      <Button onClick={join} disabled={busy}>
        {busy ? "لحظة…" : "انضم"}
      </Button>
      {joinError && <p className="text-sm text-destructive">{joinError}</p>}
    </Card>
  );
}
