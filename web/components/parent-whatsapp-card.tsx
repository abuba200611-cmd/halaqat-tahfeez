"use client";

import { useEffect, useState } from "react";

/*
  بطاقة واتساب بلوحة ولي الأمر (B1): إدخال رقم الجوال ← يصله رمز تأكيد
  من 6 أرقام ← موافقة صريحة (خانة اختيار) + إدخال الرمز. لا رسائل بلا
  موافقة مؤكَّدة، وتغيير الرقم يُسقطها فيُعاد طلبها. النصوص هنا هي نص
  الموافقة الفعلي المطلوب نظامياً.
*/

type Info = {
  phone: string | null;
  optedIn: boolean;
  optedInAt: string | null;
  pendingConfirmation?: boolean;
  /** حالة إرسال رمز التأكيد بعد حفظ الرقم مباشرة */
  codeDelivery?: "sent" | "skipped" | "failed";
};

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
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
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
    setCode("");
    const delivery = outcome.info?.codeDelivery;
    if (delivery === "skipped") {
      setNotice("خدمة واتساب غير مفعّلة حالياً فتعذّر إرسال رمز التأكيد، ولا يمكن تفعيل الرسائل الآن.");
    } else if (delivery === "failed") {
      setNotice("تعذّر إرسال رمز التأكيد إلى رقمك، تأكد من الرقم وأعد الحفظ.");
    } else {
      setNotice("أرسلنا رمز تأكيد من 6 أرقام إلى واتساب على هذا الرقم، صالح 10 دقائق.");
    }
  }

  async function confirmCode() {
    setError(null);
    setBusy(true);
    const outcome = await put({ code });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error ?? null);
      return;
    }
    setInfo(outcome.info ?? null);
    setCode("");
    setConsented(false);
    setNotice(null);
  }

  async function disableOptIn() {
    setError(null);
    setBusy(true);
    const outcome = await put({ optIn: false });
    setBusy(false);
    if (!outcome.ok) {
      setError(outcome.error ?? null);
      return;
    }
    setInfo(outcome.info ?? null);
  }

  if (info === null) return <p className="text-xs text-stone-500">جارٍ تحميل إعدادات واتساب…</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-stone-700">💬 رسائل واتساب</p>

      {info.optedIn ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-success">
            مفعّلة على <span dir="ltr" className="tabular">{info.phone}</span> ✓
          </span>
          <button
            type="button"
            onClick={disableOptIn}
            disabled={busy}
            className="cursor-pointer text-xs font-semibold text-stone-500 underline hover:no-underline disabled:opacity-50"
          >
            إيقاف
          </button>
        </div>
      ) : info.phone && !editingPhone ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-stone-600">
              الرقم المحفوظ: <span dir="ltr" className="tabular">{info.phone}</span>
            </span>
            <button
              type="button"
              onClick={() => {
                setPhone(info.phone ?? "");
                setEditingPhone(true);
              }}
              className="cursor-pointer text-xs font-semibold text-stone-500 underline hover:no-underline"
            >
              تغيير الرقم
            </button>
          </div>
          <p className="text-xs leading-5 text-stone-600">
            أوافق على استلام رسائل واتساب عن أبنائي (اعتماد الأوراد، الغياب والانضباط، نتائج الاختبارات، إصدار
            الشهادات)، وأعلم أنني أستطيع الإيقاف في أي وقت من هنا أو بالرد بكلمة «إيقاف».
          </p>
          <label className="flex items-start gap-2 text-xs text-stone-700">
            <input
              type="checkbox"
              checked={consented}
              onChange={(e) => setConsented(e.target.checked)}
              className="mt-0.5 cursor-pointer"
            />
            <span>قرأت الموافقة أعلاه وأوافق عليها</span>
          </label>
          {info.pendingConfirmation ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="رمز التأكيد"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="tabular w-32 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-800"
              />
              <button
                type="button"
                onClick={confirmCode}
                disabled={!consented || busy || code.length !== 6}
                className="cursor-pointer rounded-lg bg-success-soft px-2.5 py-1.5 text-xs font-semibold text-success hover:bg-success/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy ? "لحظة…" : "تأكيد وتفعيل رسائل واتساب"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-accent-ink">
              لا رمز تأكيد صالح — اضغط «تغيير الرقم» وأعد حفظ رقمك ليصلك رمز جديد (حدّ 3 مرات يومياً).
            </p>
          )}
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
              className="tabular w-40 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs text-stone-800"
            />
            <button
              type="button"
              onClick={savePhone}
              disabled={busy || phone.trim() === ""}
              className="cursor-pointer rounded-lg bg-accent-soft px-2.5 py-1.5 text-xs font-semibold text-accent-ink hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
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
                className="cursor-pointer text-xs font-semibold text-stone-500 underline hover:no-underline"
              >
                إلغاء
              </button>
            )}
          </div>
          <p className="text-xs text-stone-500">
            رقم جوال سعودي لاستلام رسائل الجامع عن أبنائك — يُطلب بعد الحفظ تأكيد الموافقة، وتغيير الرقم لاحقاً
            يُعيد طلبها.
          </p>
        </div>
      )}

      {notice && !error && <p className="text-xs text-stone-600">{notice}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
