import { describe, expect, it } from "vitest";

/*
  حسابات الاختبارات البحتة — درجة الخصومات والنجاح وتصحيح الإعدادات
  ونطاقات الأجزاء ونصوص الإنجاز. لا قاعدة بيانات هنا إطلاقاً.
*/

import {
  DEFAULT_EXAM_CONFIG,
  achievementText,
  hijriDateLabel,
  juzRangeLabel,
  parseErrorCounts,
  parseErrorRulesInput,
  parseExamConfig,
  scoreExam,
  validateJuzRange,
  type ErrorCounts,
} from "@/lib/mosque/exams";

const RULES = {
  maxScore: DEFAULT_EXAM_CONFIG.maxScore,
  passMark: DEFAULT_EXAM_CONFIG.passMark,
  deductions: DEFAULT_EXAM_CONFIG.deductions,
};

const counts = (overrides: Partial<ErrorCounts> = {}): ErrorCounts => ({
  jali: 0,
  khafi: 0,
  taraddud: 0,
  nisyan: 0,
  ...overrides,
});

describe("scoreExam — الدرجة بعد الخصومات", () => {
  it("لا أخطاء = الدرجة الكاملة وناجح", () => {
    const outcome = scoreExam(RULES, counts());
    expect(outcome).toEqual({ score: 100, passed: true, deductionsTotal: 0 });
  });

  it("خصم كل نوع بعدّته: جلي ٥، خفي ٢، تردد ١، نسيان ٣", () => {
    const outcome = scoreExam(RULES, counts({ jali: 2, khafi: 3, taraddud: 1, nisyan: 1 }));
    // 2×5 + 3×2 + 1×1 + 1×3 = 20
    expect(outcome.deductionsTotal).toBe(20);
    expect(outcome.score).toBe(80);
    expect(outcome.passed).toBe(true);
  });

  it("الدرجة لا تهبط تحت الصفر مهما كثرت الأخطاء", () => {
    const outcome = scoreExam(RULES, counts({ jali: 50 }));
    expect(outcome.score).toBe(0);
    expect(outcome.passed).toBe(false);
  });

  it("بلوغ درجة النجاح بالضبط = ناجح، ودونها = غير ناجح", () => {
    // خصم 40 بالضبط يهبط بالدرجة إلى 60 (النجاح عند 60)
    expect(scoreExam(RULES, counts({ jali: 8 })).passed).toBe(true);
    expect(scoreExam(RULES, counts({ jali: 8, khafi: 1 })).passed).toBe(false);
  });

  it("قواعد الخصم تُقرأ من إعدادات الجامع لا من الثوابت", () => {
    const custom = scoreExam({ ...RULES, deductions: { jali: 10, khafi: 0, taraddud: 0, nisyan: 0 } }, counts({ jali: 3 }));
    expect(custom.score).toBe(70);
  });
});

describe("parseErrorCounts — تصحيح عدّادات الأخطاء", () => {
  it("يقبل الأعداد الصحيحة ضمن السقف ويتجاهل المفاتيح المجهولة", () => {
    expect(parseErrorCounts({ jali: 2, bogus: 9 }, 50)).toEqual(counts({ jali: 2 }));
    expect(parseErrorCounts({}, 50)).toEqual(counts());
    expect(parseErrorCounts(null, 50)).toEqual(counts());
  });

  it("يرفض السالب والعشري وفوق السقف والنصوص", () => {
    expect(parseErrorCounts({ jali: -1 }, 50)).toBeNull();
    expect(parseErrorCounts({ khafi: 1.5 }, 50)).toBeNull();
    expect(parseErrorCounts({ nisyan: 51 }, 50)).toBeNull();
    expect(parseErrorCounts({ taraddud: "2" }, 50)).toBeNull();
  });
});

describe("parseExamConfig — إعدادات الجامع", () => {
  it("فارغ أو تالف = الافتراضيات كاملة", () => {
    expect(parseExamConfig(undefined)).toEqual(DEFAULT_EXAM_CONFIG);
    expect(parseExamConfig("junk")).toEqual(DEFAULT_EXAM_CONFIG);
    expect(parseExamConfig({ maxScore: -5, passMark: "x", committeeMaxMembers: 9999 })).toEqual(DEFAULT_EXAM_CONFIG);
  });

  it("يقبل القيم الصالحة فقط ويكمل الناقص من الافتراضي", () => {
    const config = parseExamConfig({ maxScore: 50, passMark: 40, deductions: { jali: 9 }, certificatePrefix: "MQ" });
    expect(config.maxScore).toBe(50);
    expect(config.passMark).toBe(40);
    expect(config.deductions).toEqual({ jali: 9, khafi: 2, taraddud: 1, nisyan: 3 });
    expect(config.certificatePrefix).toBe("MQ");
    expect(config.nominationsPerHourPerTeacher).toBe(DEFAULT_EXAM_CONFIG.nominationsPerHourPerTeacher);
  });

  it("درجة أعلى من السقف تسقط للسقف الافتراضي، والبادئة رموز آمنة فقط", () => {
    expect(parseExamConfig({ maxScore: 5000 }).maxScore).toBe(DEFAULT_EXAM_CONFIG.maxScore);
    expect(parseExamConfig({ certificatePrefix: "!!!" }).certificatePrefix).toBe(DEFAULT_EXAM_CONFIG.certificatePrefix);
  });
});

describe("parseErrorRulesInput — قواعد خصم النوع", () => {
  it("المفاتيح المعروفة فقط بقيم صحيحة", () => {
    expect(parseErrorRulesInput({ jali: 4, khafi: 1 }, 1000)).toEqual({ jali: 4, khafi: 1 });
    expect(parseErrorRulesInput({}, 1000)).toEqual({});
    expect(parseErrorRulesInput(null, 1000)).toEqual({});
  });
  it("أي مفتاح مجهول أو قيمة تالفة يرفض الكل", () => {
    expect(parseErrorRulesInput({ jali: 3, hack: 1 }, 1000)).toBeNull();
    expect(parseErrorRulesInput({ jali: -1 }, 1000)).toBeNull();
  });
});

describe("validateJuzRange — نطاقات الأجزاء", () => {
  it("نطاق صحيح مطابق لطول النوع", () => {
    expect(validateJuzRange(30, 30, 1)).toEqual({ from: 30, to: 30 });
    expect(validateJuzRange(26, 30, 5)).toEqual({ from: 26, to: 30 });
    expect(validateJuzRange(1, 30, 30)).toEqual({ from: 1, to: 30 });
  });

  it("طول مخالف أو نطاق مقلوب أو خارج ١–٣٠ يُرفض", () => {
    expect("error" in validateJuzRange(1, 2, 1)).toBe(true);
    expect("error" in validateJuzRange(5, 4, 1)).toBe(true);
    expect("error" in validateJuzRange(0, 1, 1)).toBe(true);
    expect("error" in validateJuzRange(30, 31, 2)).toBe(true);
  });
});

describe("نصوص العرض والإنجاز", () => {
  it("تسمية النطاق والإنجاز", () => {
    expect(juzRangeLabel(30, 30)).toBe("الجزء 30");
    expect(juzRangeLabel(26, 30)).toBe("الأجزاء 26–30");
    expect(achievementText(30, 30)).toBe("حفظ الجزء 30");
    expect(achievementText(26, 30)).toBe("حفظ الأجزاء 26–30");
    expect(achievementText(1, 30)).toBe("ختم القرآن الكريم");
  });

  it("التاريخ الهجري ليوم ميلادي — صيغة «يوم شهر سنة هـ»", () => {
    const label = hijriDateLabel("2026-10-17");
    expect(label).toMatch(/ هـ$/);
    expect(label).toMatch(/^\d{1,2} .+ \d{4} هـ$/);
  });
});
