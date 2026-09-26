"use client";

import { useState } from "react";
import { allSurahs, surahAyahCount } from "@/lib/quran-surahs";
import type { AyahPosInput, AyahRangeInput } from "@/lib/ward-ayah";

const SURAHS = allSurahs();
const FIELD =
  "tabular mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition-colors duration-200 focus-visible:border-blue-400 focus-visible:bg-white";

function surahOptionText(number: number): string {
  return `${number}. ${SURAHS[number - 1].name}`;
}

/** يستخرج رقم السورة من نص الخيار المُدخَل ("٦٧. الملك") — أو null لو ما طابق خياراً فعلياً */
function parseSurahText(text: string): number | null {
  const match = text.trim().match(/^(\d{1,3})\s*\./);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= SURAHS.length ? n : null;
}

function SurahCombobox({
  id,
  value,
  onChange,
}: {
  id: string;
  value: number | null;
  onChange: (surah: number | null) => void;
}) {
  const [text, setText] = useState(() => (value ? surahOptionText(value) : ""));

  // يبقي النص متزامناً لو تغيّرت القيمة من الخارج (مثل تتبّع "إلى" لـ"من" تلقائياً)
  // — يُضبَط أثناء العرض نفسه لا بأثر جانبي (نمط React الموصى به لمزامنة
  // حالة محلية مع prop متغيّر)، فلا تنشأ عنه إعادة عرض تعاقبية.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setText(value ? surahOptionText(value) : "");
  }

  return (
    <>
      <input
        list={id}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseSurahText(e.target.value));
        }}
        placeholder="ابحث باسم السورة"
        autoComplete="off"
        className={FIELD}
      />
      <datalist id={id}>
        {SURAHS.map((s) => (
          <option key={s.number} value={surahOptionText(s.number)} />
        ))}
      </datalist>
    </>
  );
}

function AyahPosFields({
  idPrefix,
  legend,
  pos,
  onChange,
}: {
  idPrefix: string;
  legend: string;
  pos: AyahPosInput;
  onChange: (pos: AyahPosInput) => void;
}) {
  const maxAyah = pos.surah ? surahAyahCount(pos.surah) : 286;
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="text-xs text-slate-500">{legend} سورة</span>
        <SurahCombobox
          id={`${idPrefix}-surah`}
          value={pos.surah}
          onChange={(surah) => onChange({ surah, ayah: pos.ayah })}
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-500">آية</span>
        <input
          type="number"
          min={1}
          max={maxAyah}
          inputMode="numeric"
          disabled={!pos.surah}
          value={pos.ayah ?? ""}
          onChange={(e) => onChange({ surah: pos.surah, ayah: e.target.value ? Number(e.target.value) : null })}
          className={`${FIELD} disabled:cursor-not-allowed disabled:opacity-50`}
        />
      </label>
    </div>
  );
}

export function AyahRangeField({
  idPrefix,
  label,
  icon,
  colorClass,
  value,
  onChange,
  error,
  pageLabel,
}: {
  idPrefix: string;
  label: string;
  icon: React.ReactNode;
  colorClass: string;
  value: AyahRangeInput;
  onChange: (next: AyahRangeInput) => void;
  error: string | null;
  pageLabel: string | null;
}) {
  // "إلى" يتبع "من" تلقائياً (نفس السورة + آخر آية فيها) حتى يعدّله الطالب بنفسه —
  // عشان "سورة كاملة" تكون بضغطة وحدة كما طُلب.
  const [toTouched, setToTouched] = useState(false);

  function setFrom(pos: AyahPosInput) {
    const nextTo = !toTouched && pos.surah ? { surah: pos.surah, ayah: surahAyahCount(pos.surah) } : value.to;
    onChange({ from: pos, to: nextTo });
  }

  function setTo(pos: AyahPosInput) {
    setToTouched(true);
    onChange({ from: value.from, to: pos });
  }

  return (
    <fieldset className="space-y-2">
      <legend className={`flex items-center gap-1.5 text-sm font-semibold ${colorClass}`}>
        {icon}
        {label}
      </legend>
      <div className="space-y-2.5">
        <AyahPosFields idPrefix={`${idPrefix}-from`} legend="من" pos={value.from} onChange={setFrom} />
        <AyahPosFields idPrefix={`${idPrefix}-to`} legend="إلى" pos={value.to} onChange={setTo} />
      </div>
      {pageLabel && !error && <p className="tabular text-xs text-slate-400">{pageLabel}</p>}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </fieldset>
  );
}
