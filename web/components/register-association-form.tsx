"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthCard, AuthShell } from "./auth-shell";
import { BrandLockup } from "./brand";
import { CheckCircleIcon } from "./icons";
import { PrivacyConsentField } from "./privacy-consent-field";
import { parseAssociationRegistrationBody } from "@/lib/association-registration";
import { PRIVACY_CONSENT_REQUIRED_MESSAGE } from "@/lib/privacy-consent-shared";

/*
  نموذج «تسجيل جمعية» العام — مرآة نموذج تسجيل الجامع. تحقق العميل (نفس
  parseAssociationRegistrationBody) لرسائل فورية فقط؛ الخادم هو الحَكَم.
  الإرسال ينشئ طلباً معلّقاً بانتظار موافقة المطوّر — لا حساب يُنشأ هنا.
*/

const fieldClass =
  "mt-1 w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/35 outline-none transition-colors duration-200 focus-visible:border-white/40 focus-visible:bg-white/10";
const invalidClass = "border-destructive-light";

type Form = {
  associationName: string;
  registrationNumber: string;
  region: string;
  applicantName: string;
  phone: string;
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
};

const EMPTY: Form = {
  associationName: "",
  registrationNumber: "",
  region: "",
  applicantName: "",
  phone: "",
  email: "",
  username: "",
  password: "",
  confirmPassword: "",
};

export function RegisterAssociationForm() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [badField, setBadField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [privacyConsent, setPrivacyConsent] = useState(false);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBadField(null);
    if (!privacyConsent) {
      setError(PRIVACY_CONSENT_REQUIRED_MESSAGE);
      setBadField("privacyConsent");
      return;
    }
    const checked = parseAssociationRegistrationBody(form);
    if (!checked.ok) {
      setError(checked.error);
      setBadField(checked.field === "confirm" ? "confirmPassword" : checked.field);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/register-association", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, privacyConsent }),
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
              طلب تسجيل جمعيتك قيد المراجعة. تتمكن من الدخول بعد الموافقة عليه باسم المستخدم وكلمة المرور اللذين اخترتهما.
            </p>
            <Link
              href="/association-login"
              className="mt-6 block w-full rounded-xl px-3 py-3 text-center text-sm font-bold"
              style={{ backgroundColor: "var(--color-secondary)", color: "var(--color-on-secondary)" }}
            >
              صفحة دخول مدير الجمعية
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
      <h1 className="font-display mb-2 pb-1 text-center text-2xl font-black leading-[1.35] text-white">تسجيل جمعية</h1>
      <p className="mb-6 text-center text-sm leading-[1.9] text-white/60">
        أرسل طلب تسجيل جمعيتك، وبعد مراجعته والموافقة عليه تدخل بحساب مدير الجمعية وتربط جوامعك.
      </p>

      <AuthCard>
        <form onSubmit={submit} noValidate className="space-y-3">
          <Field label="اسم الجمعية">
            <input value={form.associationName} onChange={set("associationName")} required maxLength={100} className={cls("associationName")} autoComplete="organization" />
          </Field>
          <Field label="رقم الترخيص (اختياري)">
            <input value={form.registrationNumber} onChange={set("registrationNumber")} maxLength={40} dir="ltr" className={`${cls("registrationNumber")} text-left`} />
          </Field>
          <Field label="المنطقة">
            <input value={form.region} onChange={set("region")} required maxLength={60} className={cls("region")} />
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

          <PrivacyConsentField checked={privacyConsent} onChange={setPrivacyConsent} invalid={badField === "privacyConsent"} />

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
            عندك حساب مدير جمعية؟{" "}
            <Link href="/association-login" className="font-semibold text-white hover:underline">
              سجّل دخولك
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
