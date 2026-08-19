import { TOTAL_PAGES, juzesOfRange } from "./quran";
import type { MemorizedRange, Student } from "./types";

const FIRST_NAMES = [
  "عبدالله", "محمد", "أحمد", "خالد", "سعد", "فيصل", "عمر", "يوسف", "إبراهيم",
  "بندر", "ماجد", "طلال", "نايف", "سلطان", "راكان", "زياد", "أنس", "مصعب",
  "حمزة", "بدر", "ريان", "تركي", "صالح", "ناصر", "وليد", "معاذ", "سيف",
];

const FAMILY_NAMES = [
  "القحطاني", "الغامدي", "الشهري", "الحربي", "العتيبي", "الزهراني", "المالكي",
  "الدوسري", "السبيعي", "الشمري", "البقمي", "العمري", "الأنصاري", "الجهني",
];

const GROUPS = ["المجموعة الأولى", "المجموعة الثانية", "المجموعة الثالثة", "المجموعة الرابعة"];

/** مولّد عشوائي ببذرة ثابتة — نفس البيانات في كل تشغيل */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * ثلاثة أنماط حفظ تتعايش في أي حلقة حقيقية:
 *   نازل  — من جزء عمّ للخلف (الأشيع)
 *   صاعد  — من البقرة للأمام
 *   مختار — جزء عمّ + سور مختارة
 * وجودها معاً هو بالضبط سبب فشل المطابقة بالموضع وحده.
 */
export function generateDemoStudents(count = 150, seed = 7): Student[] {
  const rand = seededRandom(seed);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

  const students: Student[] = [];

  for (let i = 1; i <= count; i++) {
    const roll = rand();
    const pattern = roll < 0.55 ? "descending" : roll < 0.8 ? "ascending" : "selective";
    const ranges: MemorizedRange[] = [];

    if (pattern === "descending") {
      const juzCount = between(1, 12);
      const start = TOTAL_PAGES - Math.floor((juzCount * TOTAL_PAGES) / 30) + 1;
      ranges.push({ from: Math.max(1, start), to: TOTAL_PAGES, monthsAgo: between(1, 36) });
    } else if (pattern === "ascending") {
      const juzCount = between(1, 10);
      ranges.push({ from: 1, to: Math.floor((juzCount * TOTAL_PAGES) / 30), monthsAgo: between(1, 36) });
    } else {
      const juzCount = between(1, 3);
      const start = TOTAL_PAGES - Math.floor((juzCount * TOTAL_PAGES) / 30) + 1;
      ranges.push({ from: start, to: TOTAL_PAGES, monthsAgo: between(1, 24) });
      const surahs = [
        { from: 2, to: 49 },   // البقرة
        { from: 293, to: 304 }, // الكهف
        { from: 440, to: 445 }, // يس
        { from: 562, to: 564 }, // الملك
      ];
      const extra = surahs[Math.floor(rand() * surahs.length)];
      ranges.push({ ...extra, monthsAgo: between(1, 30) });
    }

    const mastery: Record<number, number> = {};
    for (const range of ranges) {
      for (const juz of juzesOfRange(range.from, range.to)) {
        const base = 45 + Math.min(range.monthsAgo, 24) * 1.8;
        const noise = (rand() - 0.5) * 24;
        mastery[juz] = Math.max(20, Math.min(98, Math.round(base + noise)));
      }
    }

    students.push({
      id: `s${i}`,
      name: `${pick(FIRST_NAMES)} ${pick(FAMILY_NAMES)}`,
      group: pick(GROUPS),
      ranges,
      mastery,
      active: true,
      rating: 0,
    });
  }

  return students;
}
