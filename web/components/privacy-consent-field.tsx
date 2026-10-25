"use client";

import Link from "next/link";
import { PRIVACY_CONSENT_LABEL } from "@/lib/privacy-consent-shared";

/*
  خانة الموافقة الإلزامية على سياسة الخصوصية — تُستخدم في كل نماذج التسجيل.
  tone="onDark": نص فاتح للبطاقات الداكنة (شاشات الدخول الزجاجية)،
  "onLight": نص داكن للأسطح الفاتحة. الخادم هو الحَكَم؛ required هنا للتنبيه فقط.
*/
export function PrivacyConsentField({
  checked,
  onChange,
  tone = "onDark",
  invalid = false,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  tone?: "onDark" | "onLight";
  invalid?: boolean;
}) {
  const text = tone === "onDark" ? "text-white/80" : "text-stone-700";
  const link = tone === "onDark" ? "font-semibold text-white underline" : "font-semibold text-accent-ink underline";
  return (
    <label className={`flex cursor-pointer items-start gap-2 text-xs leading-relaxed ${text}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        required
        aria-invalid={invalid || undefined}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#AD7D56]"
      />
      <span>
        {PRIVACY_CONSENT_LABEL}{" "}
        <Link href="/privacy" target="_blank" rel="noopener" className={link}>
          (اقرأ السياسة)
        </Link>
      </span>
    </label>
  );
}
