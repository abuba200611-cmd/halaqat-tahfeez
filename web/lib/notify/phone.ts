/*
  تطبيع أرقام الجوال السعودية إلى صيغة E.164 (9665XXXXXXXX) — نقية واحدة
  مشتركة بين مسار ولي الأمر، وصندوق الصادر، والويبهوك. تقبل الصيغ الشائعة:
  05XXXXXXXX و5XXXXXXXX و+9665XXXXXXXX و9665XXXXXXXX و00966…، مع مسافات
  وشرطات وأقواس وأرقام عربية-هندية. ترجع null لأي شيء آخر (أرضي أو أجنبي):
  المزوّد يُرسل لجوّال سعودي فقط الآن.
*/

const EASTERN_ARABIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

/** أرقام فقط مع علامة + واحدة بترقيم البداية — كل ما عداها يُحذف */
function cleanDigits(raw: string): string {
  let out = "";
  let plusSeen = false;
  for (const ch of raw.trim()) {
    const digit = EASTERN_ARABIC_DIGITS[ch] ?? (/^[0-9]$/.test(ch) ? ch : null);
    if (digit) {
      out += digit;
      continue;
    }
    if (ch === "+" && out === "" && !plusSeen) {
      plusSeen = true;
      out = "+";
    }
  }
  return out;
}

const SAUDI_MOBILE = /^9665\d{8}$/;

/** جوال سعودي بصيغة E.164 (9665XXXXXXXX)، أو null إن لم يكن جوّالاً سعودياً صالحاً */
export function normalizeSaudiPhone(raw: string): string | null {
  const s = cleanDigits(raw);
  if (s === "") return null;

  let candidate: string;
  if (s.startsWith("+966")) candidate = `966${s.slice(4)}`;
  else if (s.startsWith("00966")) candidate = `966${s.slice(5)}`;
  else if (s.startsWith("966")) candidate = s;
  else if (s.startsWith("05")) candidate = `966${s.slice(1)}`;
  else if (s.startsWith("5")) candidate = `966${s}`;
  else return null;

  return SAUDI_MOBILE.test(candidate) ? candidate : null;
}
