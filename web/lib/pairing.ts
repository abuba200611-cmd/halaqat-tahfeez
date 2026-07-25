import { TOTAL_PAGES, juzOfPage } from "./quran";
import type {
  Candidate,
  Pair,
  PairingHistory,
  PairingResult,
  PairingSettings,
  Student,
} from "./types";

export const DEFAULT_SETTINGS: PairingSettings = {
  minOverlapPages: 20, // أقل تقاطع مقبول ≈ جزء واحد
  maxMasteryGap: 25, // أقصى فارق إتقان مقبول من ١٠٠
  repeatPenalty: 40, // خصم لمن سبق أن كان شريكاً
  overlapCap: 100, // تقاطع أكبر من هذا لا يزيد الأفضلية
  alonePriority: 30, // رفع أولوية من بقي بلا شريك سابقاً
};

/** قناع صفحات الطالب — أسرع بكثير من Set عند مقارنة آلاف الأزواج */
function pageMask(student: Student): Uint8Array {
  const mask = new Uint8Array(TOTAL_PAGES + 1);
  for (const range of student.ranges) {
    const from = Math.max(1, range.from);
    const to = Math.min(TOTAL_PAGES, range.to);
    for (let p = from; p <= to; p++) mask[p] = 1;
  }
  return mask;
}

export function pageCount(student: Student): number {
  return pageMask(student).reduce((sum, v) => sum + v, 0);
}

export function studentJuzes(student: Student): number[] {
  const mask = pageMask(student);
  const set = new Set<number>();
  for (let p = 1; p <= TOTAL_PAGES; p++) if (mask[p]) set.add(juzOfPage(p));
  return [...set].sort((x, y) => x - y);
}

function masteryOn(student: Student, juzes: number[]): number {
  const vals = juzes.map((j) => student.mastery[j]).filter((v) => typeof v === "number");
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * يحسب كل الثنائيات الصالحة وتقاطعها. هذي الخطوة الثقيلة، ونتيجتها
 * ثابتة ما دام الطلاب والمعايير لم تتغيّر — لذلك تُفصل عن الاختيار
 * حتى يعيد جدول الشهر استخدامها بدل حسابها لكل يوم من جديد.
 */
export function buildCandidates(
  students: Student[],
  settings: PairingSettings = DEFAULT_SETTINGS,
): { candidates: Candidate[]; active: Student[] } {
  const active = students.filter((s) => s.active);
  const masks = new Map(active.map((s) => [s.id, pageMask(s)]));
  const candidates: Candidate[] = [];

  for (let i = 0; i < active.length; i++) {
    for (let k = i + 1; k < active.length; k++) {
      const a = active[i];
      const b = active[k];
      const maskA = masks.get(a.id)!;
      const maskB = masks.get(b.id)!;

      let overlapPages = 0;
      const juzSet = new Set<number>();
      for (let p = 1; p <= TOTAL_PAGES; p++) {
        if (maskA[p] && maskB[p]) {
          overlapPages++;
          juzSet.add(juzOfPage(p));
        }
      }
      if (overlapPages < settings.minOverlapPages) continue;

      const overlapJuz = [...juzSet].sort((x, y) => x - y);
      const gap = Math.abs(masteryOn(a, overlapJuz) - masteryOn(b, overlapJuz));
      if (gap > settings.maxMasteryGap) continue;

      candidates.push({
        a,
        b,
        overlapPages,
        overlapJuz,
        gap,
        baseScore: Math.min(overlapPages, settings.overlapCap) - gap * 2,
      });
    }
  }

  return { candidates, active };
}

/**
 * مطابقة جشعة: نرتّب المرشحين تنازلياً ونأخذ الأعلى فالأعلى.
 * كافية لهذا الحجم — المطابقة المثلى (blossom) تعقيد بلا فائدة عند ١٥٠ طالباً.
 */
export function selectPairs(
  candidates: Candidate[],
  active: Student[],
  settings: PairingSettings = DEFAULT_SETTINGS,
  history: PairingHistory = {},
): PairingResult {
  const timesPaired = history.timesPaired ?? (() => 0);
  const timesAlone = history.timesAlone ?? (() => 0);

  const scored = candidates.map((c) => ({
    candidate: c,
    score:
      c.baseScore -
      settings.repeatPenalty * timesPaired(c.a.id, c.b.id) +
      settings.alonePriority * (timesAlone(c.a.id) + timesAlone(c.b.id)),
  }));
  scored.sort((x, y) => y.score - x.score);

  const taken = new Set<string>();
  const pairs: Pair[] = [];
  for (const { candidate, score } of scored) {
    if (taken.has(candidate.a.id) || taken.has(candidate.b.id)) continue;
    taken.add(candidate.a.id);
    taken.add(candidate.b.id);
    pairs.push({
      a: candidate.a,
      b: candidate.b,
      overlapPages: candidate.overlapPages,
      overlapJuz: candidate.overlapJuz,
      gap: candidate.gap,
      score,
    });
  }

  return {
    pairs,
    unmatched: active.filter((s) => !taken.has(s.id)),
    candidateCount: candidates.length,
    elapsedMs: 0,
  };
}

export function generatePairs(
  students: Student[],
  settings: PairingSettings = DEFAULT_SETTINGS,
  history: PairingHistory = {},
): PairingResult {
  const started = performance.now();
  const { candidates, active } = buildCandidates(students, settings);
  const result = selectPairs(candidates, active, settings, history);
  return { ...result, elapsedMs: Math.round(performance.now() - started) };
}

/** يحسب تفاصيل ثنائية يدوية اختارها المعلّم، حتى لو خالفت الحدود */
export function describePair(a: Student, b: Student): Pair {
  const maskA = pageMask(a);
  const maskB = pageMask(b);
  let overlapPages = 0;
  const juzSet = new Set<number>();
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    if (maskA[p] && maskB[p]) {
      overlapPages++;
      juzSet.add(juzOfPage(p));
    }
  }
  const overlapJuz = [...juzSet].sort((x, y) => x - y);
  return {
    a,
    b,
    overlapPages,
    overlapJuz,
    gap: Math.abs(masteryOn(a, overlapJuz) - masteryOn(b, overlapJuz)),
    score: 0,
    manual: true,
  };
}
