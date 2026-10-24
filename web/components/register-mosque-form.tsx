"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthShell } from "./auth-shell";
import { BrandLockup } from "./brand";
import { CheckCircleIcon } from "./icons";
import { parseMosqueRegistrationBody } from "@/lib/mosque-registration";

/*
  نموذج «تسجيل جامع» العام. تحقق العميل مرآة لتحقق الخادم (نفس
  parseMosqueRegistrationBody) لرسائل فورية فقط؛ الخادم هو الحَكَم دائماً.
  الإرسال ينشئ طلباً معلّقاً بانتظار موافقة المطوّر — لا حساب يُنشأ هنا.
*/

const fieldClass =
  "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10";
const invalidClass = "border-destructive-light";

type Form = {
  mosqueName: string;
  city: string;
  applicantName: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  associationName: string;
};

const EMPTY: Form = {
  mosqueName: "",
  city: "",
  applicantName: "",
  phone: "",
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
  associationName: "",
};

export function RegisterMosqueForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBadField(null);
    const checked = parseMosqueRegistrationBody(form);
    if (!checked.ok) {
      setError(checked.error);
      setBadField(checked.field === "confirm" ? "confirmPassword" : checked.field);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/register-mosque", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
      if (!res.ok) {
        setError(data.error ?? "تعذّر إرسال الطلب");
        setBadField(data.field ?? null);
        return;
      }
      setDone(true);
    } catch {
      setError("تعذّر الاتصال بالخادم");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthShell>
        <div className="mb-4 flex justify-center">
          <BrandLockup tone="onDark" href="/welcome" />
        </div>
        <AuthCard>
          <div className="text-center">
            <CheckCircleIcon size={44} className="mx-auto text-secondary" />
            <h1 className="font-display mt-4 pb-1 text-2xl font-black leading-[1.35] text-white">وصلنا طلبك</h1>
            <p className="mt-3 text-sm leading-[1.9] text-white/75">
              طلب تسجيل جامعك قيد المراجعة. سنراجعه وتتمكن من الدخول بعد الموافقة عليه باسم المستخدم وكلمة المرور اللذين اخترتهما.
            </p>
            <Link
              href="/mosque-login"
              className="mt-6 block w-full rounded-xl px-3 py-3 text-center text-sm font-bold"
              style={{ backgroundColor: "var(--color-secondary)", color: "var(--color-on-secondary)" }}
            >
              صفحة دخول مدير الجامع
            </Link>
            <Link href="/welcome" className="mt-3 block text-xs text-white/60 hover:text-white">
              العودة للواجهة
            </Link>
          </div>
        </AuthCard>
      </AuthShell>
    );
  }

  const cls = (name: string) => `${fieldClass} ${badField === name ? invalidClass : ""}`;

  return (
    <AuthShell>
      <div className="mb-4 flex justify-center">
        <BrandLockup tone="onDark" href="/welcome" />
      </div>
      <h1 className="font-display mb-2 pb-1 text-center text-2xl font-black leading-[1.35] text-white">تسجيل جامع</h1>
      <p className="mb-6 text-center text-sm leading-[1.9] text-white/60">
        أرسل طلب تسجيل جامعك، وبعد مراجعته والموافقة عليه تدخل بحساب مدير الجامع.
      </p>

      <AuthCard>
        <form onSubmit={submit} noValidate className="space-y-3">
          <Field label="اسم الجامع">
            <input value={form.mosqueName} onChange={set("mosqueName")} required maxLength={100} className={cls("mosqueName")} autoComplete="organization" />
          </Field>
          <Field label="المدينة أو الحي (اختياري)">
            <input value={form.city} onChange={set("city")} maxLength={60} className={cls("city")} />
          </Field>
          <Field label="اسم مقدّم الطلب">
            <input value={form.applicantName} onChange={set("applicantName")} required maxLength={80} className={cls("applicantName")} autoComplete="name" />
          </Field>
          <Field label="رقم الجوال">
            <input value={form.phone} onChange={set("phone")} required inputMode="tel" dir="ltr" autoComplete="tel" className={`${cls("phone")} text-left`} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input value={form.email} onChange={set("email")} required type="email" dir="ltr" autoComplete="email" className={`${cls("email")} text-left`} />
          </Field>
          <Field label="اسم المستخدم للدخول (حروف لاتينية وأرقام)">
            <input value={form.username} onChange={set("username")} required dir="ltr" autoComplete="username" autoCapitalize="none" className={`${cls("username")} text-left`} />
          </Field>
          <Field label="كلمة المرور (٨ أحرف فأكثر)">
            <input value={form.password} onChange={set("password")} required type="password" autoComplete="new-password" className={cls("password")} />
          </Field>
          <Field label="تأكيد كلمة المرور">
            <input value={form.confirmPassword} onChange={set("confirmPassword")} required type="password" autoComplete="new-password" className={cls("confirmPassword")} />
          </Field>
          <Field label="اسم الجمعية (اختياري)">
            <input value={form.associationName} onChange={set("associationName")} maxLength={100} className={cls("associationName")} />
          </Field>

          {error && (
            <p role="alert" className="text-sm leading-relaxed text-destructive-light">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-xl px-3 py-3 text-sm font-bold shadow-lg transition-shadow duration-200 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: "var(--color-secondary)", color: "var(--color-on-secondary)" }}
          >
            {busy ? "لحظة…" : "إرسال الطلب"}
          </button>
        </form>

        <div className="mt-4 space-y-1.5 text-center text-xs leading-relaxed text-white/60">
          <p>
            عندك حساب مدير جامع؟{" "}
            <Link href="/mosque-login" className="font-semibold text-white hover:underline">
              سجّل دخولك
            </Link>
          </p>
          <p>
            أنت معلّم؟{" "}
            <Link href="/signup" className="font-semibold text-white hover:underline">
              أنشئ حساب معلّم
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-xs leading-relaxed text-white/60">{label}</span>
      {children}
    </label>
  );
}
