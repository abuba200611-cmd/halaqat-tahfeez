"use client";

import { useEffect, useState } from "react";

/*
  بطاقة واتساب بلوحة ولي الأمر (B1): إدخال رقم الجوال ثم موافقة صريحة
  (خانة اختيار + زر) — لا رسائل بلا موافقة، وتغيير الرقم يُسقطها فيُعاد
  طلبها. النصوص هنا هي نص الموافقة الفعلي المطلوب نظامياً.
*/

type Info = { phone: string | null; optedIn: boolean; optedInAt: string | null };

async function put(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; info?: Info }> {
  try {
    const res = await fetch("/api/parent/whatsapp", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Info & { error?: string };
    return res.ok ? { ok: true, info: data } : { ok: false, error: data.error ?? "تعذّر الحفظ" };
  } catch {
    return { ok: false, error: "تعذّر الاتصال بالخادم" };
  }
}

export function ParentWhatsappCard() {
  const [info, setInfo] = useState<Info | null>(null);
  const [phone, setPhone] = useState("");
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/parent/whatsapp")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Info | null) => {
        if (!cancelled) setInfo(data ?? { phone: null, optedIn: false, optedInAt: null });
      })
      .catch(() => {
        if (!cancelled) setInfo({ phone: null, optedIn: false, optedInAt: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function savePhone() {
    setError(null);
    setBusy(true);
    const outcome = await put({ phone });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error ?? null);
      return;
    }
    setInfo(outcome.info ?? null);
    setPhone("");
    setEditingPhone(false);
    setConsented(false);
  }

  async function setOptIn(optIn: boolean) {
    setError(null);
    setBusy(true);
    const outcome = await put({ optIn });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error ?? null);
      return;
    }
    setInfo(outcome.info ?? null);
  }

  if (info === null) return <p className="text-xs text-slate-500">جارٍ تحميل إعدادات واتساب…</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-slate-700">💬 رسائل واتساب</p>

      {info.optedIn ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-emerald-700">
            مفعّلة على <span dir="ltr" className="tabular">{info.phone}</span> ✓
          </span>
          <button
            type="button"
            onClick={() => setOptIn(false)}
            disabled={busy}
            className="cursor-pointer text-xs font-semibold text-slate-500 underline hover:no-underline disabled:opacity-50"
          >
            إيقاف
          </button>
        </div>
      ) : info.phone && !editingPhone ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-600">
              الرقم المحفوظ: <span dir="ltr" className="tabular">{info.phone}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setPhone(info.phone ?? "");
                setEditingPhone(true);
              }}
              className="cursor-pointer text-xs font-semibold text-slate-500 underline hover:no-underline"
            >
              تغيير الرقم
            </button>
          </div>
          <p className="text-xs leading-5 text-slate-600">
            أوافق على استلام رسائل واتساب عن أبنائي (اعتماد الأوراد، الغياب والانضباط، نتائج الاختبارات، إصدار
            الشهادات)، وأعلم أنني أستطيع الإيقاف في أي وقت من هنا أو بالرد بكلمة «إيقاف».
          </p>
          <label className="flex items-start gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 cursor-pointer"
            />
            <span>قرأت الموافقة أعلاه وأوافق عليها</span>
          </label>
          <button
            type="button"
            onClick={() => setOptIn(true)}
            disabled={!consented || busy}
            className="cursor-pointer rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "لحظة…" : "تفعيل رسائل واتساب"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
              dir="ltr"
              inputMode="tel"
              className="tabular w-40 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-800"
            />
            <button
              type="button"
              onClick={savePhone}
              disabled={busy || phone.trim() === ""}
              className="cursor-pointer rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "لحظة…" : "حفظ الرقم"}
            </button>
            {info.phone && (
              <button
                type="button"
                onClick={() => {
                  setPhone("");
                  setEditingPhone(false);
                }}
                className="cursor-pointer text-xs font-semibold text-slate-500 underline hover:no-underline"
              >
                إلغاء
              </button>
            )}
          </div>
          <p className="text-xs text-slate-500">
            رقم جوال سعودي لاستلام رسائل الجامع عن أبنائك — يُطلب بعد الحفظ تأكيد الموافقة، وتغيير الرقم لاحقاً
            يُعيد طلبها.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
