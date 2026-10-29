"use client";

import { AyahRangeField } from "@/components/ayah-range-field";
import { BookIcon } from "@/components/icons";
import { juzToPages, TOTAL_JUZ } from "@/lib/quran";
import { TOTAL_MUSHAF_PAGES } from "@/lib/quran-surahs";
import type { WardUnit } from "@/lib/halaqah-stage";
import { formatWardByUnit, parseHifzPagesInput } from "@/lib/ward-units";
import { parseAyahRange, type AyahRangeInput } from "@/lib/ward-ayah";

/*
  حقول إدخال الحفظ بوحدة فئة الحلقة (001 T032، FR-006): الآياتي
  (سور وآيات / آيات وصفحات) يعرض حقل السورة/الآية القائم مع «≈ صفحة»
  المقابلة، والصفحاتي (صفحات وأوجه / أوجه وأجزاء) حقلا صفحة من/إلى مع
  أزرار «جزء كامل» السريعة. يُخرج دائماً {hifz} أو {hifzPages} — التخزين
  لا يتغيّر (التحويل للآيات يتم خادمياً عبر ayahRangeOfPageRange).
*/

/** وحدات الفئة التي يُدخل حفظها بالصفحات (ثانوي/جامعي) */
export function unitUsesPages(unit: WardUnit | null | undefined): unit is "page_wajh" | "wajh_juz" {
  return unit === "page_wajh" || unit === "wajh_juz";
}

/** قيمة قسم الحفظ — يُبقي القسمين معاً فلا تضيع قيمة لو تغيّرت فئة الحلقة */
export type WardHifzFormValue = {
  ayah: AyahRangeInput;
  pages: { from: string; to: string };
};

export const EMPTY_WARD_HIFZ: WardHifzFormValue = {
  ayah: { from: { surah: null, ayah: null }, to: { surah: null, ayah: null } },
  pages: { from: "", to: "" },
};

function isAyahTouched(v: AyahRangeInput): boolean {
  return v.from.surah != null || v.from.ayah != null || v.to.surah != null || v.to.ayah != null;
}

/** هل لُمس قسم الحفظ أصلاً؟ — بحسب الوحدة: الآيات أو حقلا الصفحة */
export function isWardHifzTouched(value: WardHifzFormValue, unit: WardUnit | null): boolean {
  return unitUsesPages(unit) ? value.pages.from !== "" || value.pages.to !== "" : isAyahTouched(value.ayah);
}

/**
 * رسالة الخطأ الفورية ومعاينة الوحدة لقسم الحفظ — يعيد استخدام
 * parseAyahRange وparseHifzPagesInput نفسيهما اللذين يستخدمهما الخادم،
 * فلا تتكرر قواعد التحقق بمكانين. القسم الفارغ تماماً ليس خطأ (اختياري).
 */
export function describeWardHifz(
  value: WardHifzFormValue,
  unit: WardUnit | null,
): { error: string | null; pageLabel: string | null } {
  if (!unitUsesPages(unit)) {
    const touched = isAyahTouched(value.ayah);
    try {
      const parsed = parseAyahRange(value.ayah, "الحفظ");
      if (!parsed) return { error: null, pageLabel: null };
      const { from, to } = parsed.pages;
      return { error: null, pageLabel: from === to ? `≈ صفحة ${from}` : `≈ صفحة ${from}–${to}` };
    } catch (e) {
      if (!touched) return { error: null, pageLabel: null };
      return { error: e instanceof Error ? e.message : "قيمة غير صحيحة", pageLabel: null };
    }
  }
  const { from, to } = value.pages;
  if (from === "" && to === "") return { error: null, pageLabel: null };
  try {
    const range = parseHifzPagesInput({ from: from === "" ? null : Number(from), to: to === "" ? null : Number(to) });
    if (!range) return { error: null, pageLabel: null };
    // معاينة بوحدة الفئة نفسها: «وجه 603» / «3 أوجه (ص 502–504)» / «جزء 30»
    return { error: null, pageLabel: formatWardByUnit(unit, range, null) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "قيمة غير صحيحة", pageLabel: null };
  }
}

/**
 * جسم قسم الحفظ للإرسال: hifz للوحدات الآياتية وhifzPages لوحدات
 * الصفحات — لا يجتمعان أبداً (المسار يرفضهما معاً بـ400). القسم الفارغ
 * يرسل null للاثنين.
 */
export function wardHifzBody(
  value: WardHifzFormValue,
  unit: WardUnit | null,
): { hifz: AyahRangeInput | null; hifzPages: { from: number; to: number } | null } {
  if (unitUsesPages(unit)) {
    const { from, to } = value.pages;
    if (from === "" && to === "") return { hifz: null, hifzPages: null };
    // يرمي لو ناقصاً — زر الإرسال معطّل قبله بفضل describeWardHifz
    const range = parseHifzPagesInput({ from: Number(from), to: Number(to) });
    return { hifz: null, hifzPages: range };
  }
  return { hifz: value.ayah, hifzPages: null };
}

const FIELD =
  "tabular mt-1 w-full rounded-xl border border-border bg-surface px-3 py-3 text-base text-foreground outline-none transition-colors duration-200 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * قسم الحفظ كاملاً بحسب وحدة الفئة — بديل مباشر لـAyahRangeField بنموذج
 * الطالب. الوحدة null (حلقة بلا فئة) = حقول الآيات القائمة كما هي.
 */
export function WardInputByUnit({
  unit,
  value,
  onChange,
  error,
}: {
  unit: WardUnit | null;
  value: WardHifzFormValue;
  onChange: (next: WardHifzFormValue) => void;
  error: string | null;
}) {
  const { pageLabel } = describeWardHifz(value, unit);

  if (!unitUsesPages(unit)) {
    return (
      <AyahRangeField
        idPrefix="hifz"
        label="الحفظ الجديد"
        icon={<BookIcon size={16} />}
        colorClass="text-success"
        value={value.ayah}
        onChange={(ayah) => onChange({ ...value, ayah })}
        error={error}
        pageLabel={pageLabel}
      />
    );
  }

  const wajhWord = unit === "page_wajh" ? "وجه" : "صفحة/وجه";

  return (
    <fieldset className="space-y-2">
      <legend className="flex items-center gap-1.5 text-sm font-semibold text-success">
        <BookIcon size={16} />
        الحفظ الجديد ({wajhWord})
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs text-muted-foreground">من صفحة</span>
          <input
            type="number"
            min={1}
            max={TOTAL_MUSHAF_PAGES}
            inputMode="numeric"
            value={value.pages.from}
            onChange={(e) => onChange({ ...value, pages: { ...value.pages, from: e.target.value } })}
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className="text-xs text-muted-foreground">إلى صفحة</span>
          <input
            type="number"
            min={1}
            max={TOTAL_MUSHAF_PAGES}
            inputMode="numeric"
            value={value.pages.to}
            onChange={(e) => onChange({ ...value, pages: { ...value.pages, to: e.target.value } })}
            className={FIELD}
          />
        </label>
      </div>
      {/* جزء كامل بضغطة واحدة — حدود الأجزاء الثلاثين الفعلية (قرار المالك Q3) */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: TOTAL_JUZ }, (_, i) => i + 1).map((juzNumber) => (
          <button
            key={juzNumber}
            type="button"
            onClick={() => {
              const juz = juzToPages(juzNumber, juzNumber);
              onChange({ ...value, pages: { from: String(juz.from), to: String(juz.to) } });
            }}
            className="tabular min-h-9 min-w-11 cursor-pointer rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-foreground transition-colors duration-200 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            جزء {juzNumber}
          </button>
        ))}
      </div>
      {pageLabel && !error && <p className="tabular text-xs text-muted-foreground">{pageLabel}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </fieldset>
  );
}
