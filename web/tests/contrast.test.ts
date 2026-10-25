import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  قاعدة المالك: نص فاتح على السطح الداكن، ونص داكن على السطح الفاتح —
  WCAG AA دائماً (٤.٥:١ للنص العادي، ٣:١ للكبير/الحدود). هذا الاختبار يقرأ
  رموز الهوية من app/globals.css نفسها (لا نسخة ثانية تنحرف) ويحسب نسب
  التباين لكل زوج قيد الاستعمال في الوضعين الفاتح والداكن، بما فيها أزواج
  الصفحة الترحيبية الحرفية (أسود/بيج/رمل).
*/

const CSS = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

function varsOf(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

const lightMatch = CSS.match(/@theme\s*\{([\s\S]*?)\n\}/);
const darkMatch = CSS.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/);
if (!lightMatch || !darkMatch) throw new Error("تعذّر قراءة رموز الألوان من globals.css");

const LIGHT = varsOf(lightMatch[1]);
const DARK = varsOf(darkMatch[1]);

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fg: string, bg: string): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

function ratio(vars: Record<string, string>, fg: string, bg: string): number {
  const f = vars[fg];
  const b = vars[bg];
  if (!f || !b) throw new Error(`رمز غير معروف: ${!f ? fg : bg}`);
  return contrastRatio(f, b);
}

/** أزواج النص/السطح من رموز المنصة (نص عادي → ٤.٥:١) */
const BODY_PAIRS: [fg: string, bg: string][] = [
  ["--color-foreground", "--color-surface"],
  ["--color-foreground", "--color-background"],
  ["--color-muted-foreground", "--color-surface"],
  ["--color-muted-foreground", "--color-muted"],
  ["--color-on-primary", "--color-primary"],
  ["--color-on-secondary", "--color-secondary"],
  ["--color-accent-ink", "--color-surface"],
  ["--color-accent-ink", "--color-background"],
  ["--color-accent-ink", "--color-accent-soft"],
  ["--color-destructive", "--color-surface"],
  ["--color-destructive", "--color-destructive-soft"],
  ["--color-success", "--color-surface"],
  ["--color-success", "--color-success-soft"],
];

/**
 * destructive-light درجةٌ لرسائل الأخطاء فوق الأسطح الداكنة فقط (قشور
 * الدخول السوداء) — لا تُقترن بخلفية فاتحة، فنختبرها على داكن المنصة.
 */

/** أزواج الصفحة الترحيبية الحرفية (تصميم ثابت لا يتغيّر بالوضع الداكن) */
const LITERAL_PAIRS: [fg: string, bg: string, label: string][] = [
  ["#CDB49E", "#000000", "رمل على أسود (هيرو/تذييل)"],
  ["#F3EDE6", "#000000", "أبيض دافئ على أسود"],
  ["#ffffff", "#000000", "أبيض على أسود"],
  ["#AD7D56", "#000000", "بيج فرنسي على أسود (أيقونات/حواف)"],
  ["#000000", "#CDB49E", "أسود على رمل (شريط الكلمات)"],
  ["#000000", "#AD7D56", "أسود على بيج (أزرار/DTA)"],
  ["#e9d9c6", "#000000", "نص الآية على بطاقة الهيرو السوداء"],
  ["#e39b8d", "#000000", "رسالة خطأ فاتحة على قشرة الدخول السوداء"],
  ["#CDB49E", "#241b12", "رمل على بطاقة داكنة بنية"],
  ["#5F5344", "#ffffff", "نص هامد على بطاقة بيضاء"],
  ["#5F5344", "#F3EDE6", "نص هامد على خلفية فاتحة"],
  ["#7F5636", "#F0E4D2", "حبر البيج على رقاقة بيج فاتح"],
  ["#7F5636", "#F3EDE6", "حبر البيج على خلفية فاتحة"],
];

describe("تباين رموز الهوية (globals.css)", () => {
  it("الوضع الفاتح: كل أزواج النص العادي ≥ ٤.٥:١", () => {
    for (const [fg, bg] of BODY_PAIRS) {
      expect(ratio(LIGHT, fg, bg), `${fg} على ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("الوضع الداكن: كل أزواج النص العادي ≥ ٤.٥:١", () => {
    for (const [fg, bg] of BODY_PAIRS) {
      expect(ratio(DARK, fg, bg), `${fg} على ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("نص الأخطاء فوق الأسطح الداكنة (destructive-light) ≥ ٤.٥:١", () => {
    expect(ratio(DARK, "--color-destructive-light", "--color-surface")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#e39b8d", "#000000")).toBeGreaterThanOrEqual(4.5);
  });

  it("أزواج الصفحة الترحيبية الحرفية ≥ ٤.٥:١", () => {
    for (const [fg, bg, label] of LITERAL_PAIRS) {
      expect(contrastRatio(fg, bg), label).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("أسود على بيج شفاف ٨٠٪ (نص CTA الثانوي) ≥ ٤.٥:١", () => {
    // text-black/80 فوق #AD7D56 = مزج ٨٠٪ أسود مع ٢٠٪ بيج لكل قناة
    const blend = [173, 125, 86].map((v) => Math.round(0.8 * 0 + 0.2 * v));
    const fg = `#${blend.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    expect(contrastRatio(fg, "#AD7D56")).toBeGreaterThanOrEqual(4.5);
  });
});

/*
  فحص مصدري: عنصر واحد بخلفية داكنة صريحة (bg-black / bg-foreground / bg-primary
  / hex قريب من الأسود) ونصّه بلون داكن في نفس سلسلة الأصناف الثابتة. السلاسل
  ذات الشرط (\`...${}\`) تُستثنى لأن خلفيتها ونصها قد يقعان في فرعين مختلفين.
  bg-foreground لا يُقبل أصلاً مع نص فاتح صريح لأنه ينقلب فاتحاً في الوضع الداكن.
*/
const DARK_BG = /(?<![\w:-])bg-(?:black|foreground|\[#[0-2][0-9a-fA-F]{5}\])(?![\w/-])/;
const DARK_TEXT = /(?<![\w:-])text-(?:black|foreground|muted-foreground|stone-[1-9]00|\[#[0-5][0-9a-fA-F]{5}\])(?![\w/-])/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("لا نص داكن على سطح داكن في أي مكوّن", () => {
  it("لا سلسلة أصناف ثابتة تجمع خلفية داكنة ونصاً داكناً", () => {
    const root = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
    const offenders: string[] = [];
    for (const file of [...walk(join(root, "app")), ...walk(join(root, "components"))]) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/className="([^"]*)"/g)) {
        if (DARK_BG.test(m[1]) && DARK_TEXT.test(m[1])) offenders.push(`${file}: ${m[1].slice(0, 90)}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("القوائم المنسدلة السوداء لا تستعمل bg-foreground (ينقلب فاتحاً بالوضع الداكن)", () => {
    const src = readFileSync(new URL("../components/role-switcher.tsx", import.meta.url), "utf8");
    expect(src).not.toMatch(/bg-foreground/);
  });
});
