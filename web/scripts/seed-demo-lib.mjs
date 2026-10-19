/*
  مولّد بيانات العرض التجريبي — دوال نقية بلا قاعدة بيانات ولا ملفات.
  نفس البذرة + نفس التاريخ = نفس الخطة حرفياً (تُختبر في seed-demo-lib.test.mjs).
  seed-demo.mjs يقرأ هذه الخطة ويُدخلها بمعاملة واحدة، ويسجّلها في demo_seed_rows
  لتُحذف بدقة لاحقاً.

  ملاحظة صدق: خريطة صفحة→(سورة، آية) هنا تقريبية (استكمال خطي داخل السورة)
  وتكفي للعرض التجريبي؛ لا تُستعمل مرجعاً شرعياً.
*/

export const DEMO_PREFIX = "(تجريبي)";
export const DEFAULT_SEED = 20261020;
export const EXISTING_TEACHER_ID = 70;

/** مزايا الجامع المفعّلة للعرض (مفاتيح lib/mosque/features.ts). attendance ليس مفتاح ميزة. */
export const FEATURES_ON = [
  "halaqat", "registration", "stats", "honor_board", "juz_progress", "exams", "messaging",
  "supervisor_visits", "fees", "auto_assign", "error_grading", "qr_attendance",
];
export const FEATURES_OFF = ["whatsapp"];

export const TOTAL_PAGES = 604;

/** أول صفحة من كل جزء (مصحف المدينة) — نفس lib/quran.ts */
export const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282,
  302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

export const SURAH_START_PAGES = [
  1, 2, 50, 77, 106, 128, 151, 177, 187, 208, 221, 235, 249, 255, 262, 267, 282, 293, 305, 312,
  322, 332, 342, 350, 359, 367, 377, 385, 396, 404, 411, 415, 418, 428, 434, 440, 446, 453, 458, 467,
  477, 483, 489, 496, 499, 502, 507, 511, 515, 518, 520, 523, 526, 528, 531, 534, 537, 542, 545, 549,
  551, 553, 554, 556, 558, 560, 562, 564, 566, 568, 570, 572, 574, 575, 577, 578, 580, 582, 583, 585,
  586, 587, 587, 589, 590, 591, 591, 592, 593, 594, 595, 595, 596, 596, 597, 597, 598, 598, 599, 599,
  600, 600, 601, 601, 601, 602, 602, 602, 603, 603, 603, 604, 604, 604,
];

export const SURAH_AYAHS = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

// ————— أدوات عامة —————

/** مولّد عشوائي ببذرة (mulberry32) — نفس مولّد lib/demo.ts */
export function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = الأحد … 6 = السبت */
export function weekdayOf(iso) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

/** تاريخ اليوم بتوقيت UTC+3 (بلا اسم مدينة) */
export function todayIso(now = new Date()) {
  return new Date(now.getTime() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** أيام الدوام (الأحد–الخميس) خلال آخر `span` يوماً شاملاً اليوم، من الأقدم للأحدث */
export function sessionDays(today, span = 30) {
  const days = [];
  for (let i = span - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    if (weekdayOf(date) <= 4) days.push(date);
  }
  return days;
}

const isoAt = (date, time) => `${date}T${time}+03:00`;

// ————— صفحة → (سورة، آية) تقريبي —————

function surahBounds(s) {
  const start = SURAH_START_PAGES[s - 1];
  const next = s < 114 ? SURAH_START_PAGES[s] : TOTAL_PAGES + 1;
  return { start, span: Math.max(1, next - start) };
}

export function positionAtPageStart(page) {
  let surah = 1;
  const first = SURAH_START_PAGES.findIndex((p) => p === page);
  if (first >= 0) {
    surah = first + 1;
    return { surah, ayah: 1 };
  }
  for (let s = 1; s <= 114; s++) if (SURAH_START_PAGES[s - 1] < page) surah = s;
  const { start, span } = surahBounds(surah);
  const ayahs = SURAH_AYAHS[surah - 1];
  const ayah = Math.min(ayahs, Math.max(1, 1 + Math.floor(((page - start) / span) * ayahs)));
  return { surah, ayah };
}

export function positionAtPageEnd(page) {
  let surah = 1;
  for (let s = 1; s <= 114; s++) if (SURAH_START_PAGES[s - 1] <= page) surah = s;
  const { start, span } = surahBounds(surah);
  const ayahs = SURAH_AYAHS[surah - 1];
  const frac = Math.min(1, (page - start + 1) / span);
  return { surah, ayah: Math.min(ayahs, Math.max(1, Math.ceil(frac * ayahs))) };
}

/** مقطع صفحات → مواضع سورة/آية، مضمون أن البداية ≤ النهاية */
export function pageRangeToAyahs(fromPage, toPage) {
  const a = positionAtPageStart(fromPage);
  const b = positionAtPageEnd(toPage);
  const toSurah = Math.max(a.surah, b.surah);
  let toAyah = b.ayah;
  if (toSurah === a.surah && toAyah < a.ayah) toAyah = a.ayah;
  return { fromSurah: a.surah, fromAyah: a.ayah, toSurah, toAyah: toSurah === b.surah ? toAyah : SURAH_AYAHS[toSurah - 1] };
}

// ————— أسماء —————

const FIRST_NAMES = [
  "عبدالله", "محمد", "أحمد", "خالد", "سعد", "فيصل", "عمر", "يوسف", "إبراهيم", "بندر",
  "ماجد", "طلال", "نايف", "سلطان", "راكان", "زياد", "أنس", "مصعب", "حمزة", "بدر",
  "ريان", "تركي", "صالح", "ناصر", "وليد", "معاذ", "سيف", "عبدالرحمن", "عبدالعزيز", "سليمان",
  "هشام", "جابر", "مالك", "أسامة", "براء", "عمار", "ياسر", "إياد", "لؤي", "كريم",
];

const SECOND_NAMES = [
  "سعود", "فهد", "علي", "حسن", "حسين", "منصور", "عادل", "نبيل", "رشيد", "جمال",
  "كمال", "بسام", "ظافر", "مشاري", "ثامر", "رائد", "عيسى", "موسى", "هود", "داود",
  "إسماعيل", "إسحاق", "يحيى", "زكريا", "لقمان", "شعيب", "أيوب", "صهيب", "خبيب", "بلال",
];

const TEACHER_NAMES = ["سعد", "ماجد", "هشام", "خالد", "طارق", "نواف"];

/** اسم طالب فريد لكل رقم تسلسلي عام (0..1199 على الأقل) */
export function studentFullName(globalIndex) {
  const first = FIRST_NAMES[(globalIndex * 13) % FIRST_NAMES.length];
  const second = SECOND_NAMES[(globalIndex * 7 + Math.floor(globalIndex / FIRST_NAMES.length)) % SECOND_NAMES.length];
  return `${first} ${second}`;
}

// ————— إعدادات تقدير الأخطاء (نسخة من DEFAULT_ERROR_GRADING_CONFIG) —————

const ERROR_TYPES = [
  { key: "hifz", points: 2 },
  { key: "hesitation", points: 1 },
  { key: "tajweed", points: 0.5 },
  { key: "tashkeel", points: 0.5 },
];
const ERROR_BANDS = [
  { label: "ممتاز", min: 90 }, { label: "جيد جداً", min: 80 }, { label: "جيد", min: 70 },
  { label: "مقبول", min: 60 }, { label: "يحتاج إعادة", min: 0 },
];

export function gradeErrors(counts) {
  const deducted = ERROR_TYPES.reduce((sum, t) => sum + (counts[t.key] ?? 0) * t.points, 0);
  const score = Math.max(0, 100 - deducted);
  const band = ERROR_BANDS.find((b) => score >= b.min).label;
  return { score, band };
}

// خصومات الاختبارات (DEFAULT_EXAM_CONFIG)
const EXAM_DEDUCTIONS = { jali: 5, khafi: 2, taraddud: 1, nisyan: 3 };

// ————— هيكل الجوامع والحلقات —————

const MOSQUES = [
  { key: "noor", name: `${DEMO_PREFIX} جامع النور`, association: true },
  { key: "huda", name: `${DEMO_PREFIX} جامع الهدى`, association: true },
  { key: "furqan", name: `${DEMO_PREFIX} جامع الفرقان`, association: false },
];

/** halaqah 'noor-1' هي حلقة المعلّم 70 القائمة (تُربط ولا تُنشأ) */
const HALAQAT = [
  { key: "noor-1", mosque: "noor", name: null, existingTeacherId: EXISTING_TEACHER_ID, capacity: null, level: null, minAge: null, maxAge: null, students: 10 },
  { key: "noor-2", mosque: "noor", name: `${DEMO_PREFIX} حلقة التبيان`, capacity: 15, level: "intermediate", minAge: 9, maxAge: 14, students: 10 },
  { key: "noor-3", mosque: "noor", name: `${DEMO_PREFIX} حلقة الترتيل`, capacity: 12, level: "beginner", minAge: 7, maxAge: 11, students: 10 },
  { key: "huda-1", mosque: "huda", name: `${DEMO_PREFIX} حلقة الإتقان`, capacity: 14, level: "advanced", minAge: 12, maxAge: 18, students: 11 },
  { key: "huda-2", mosque: "huda", name: `${DEMO_PREFIX} حلقة السكينة`, capacity: 18, level: "intermediate", minAge: 8, maxAge: 13, students: 10 },
  { key: "furqan-1", mosque: "furqan", name: `${DEMO_PREFIX} حلقة الفجر`, capacity: 16, level: "beginner", minAge: 6, maxAge: 10, students: 10 },
  { key: "furqan-2", mosque: "furqan", name: `${DEMO_PREFIX} حلقة البشائر`, capacity: 20, level: "advanced", minAge: 12, maxAge: 17, students: 9 },
];

const REGISTRANTS = [
  { first: "أنس", second: "مشعل", birthAge: 9, level: "beginner" },
  { first: "حاتم", second: "رياض", birthAge: 11, level: "intermediate" },
  { first: "قيس", second: "عدنان", birthAge: 8, level: "beginner" },
  { first: "نواف", second: "زهير", birthAge: 13, level: "advanced" },
];

const VISIT_CRITERIA = [
  "attendance_discipline", "recitation_quality", "tajweed_application", "plan_commitment",
  "environment_order", "student_engagement", "teacher_records",
];

const pad2 = (n) => String(n).padStart(2, "0");

/** عدد الصفحات الكاملة لـ J جزءاً من آخر المصحف (حفظ تنازلي من جزء عمّ) */
export function pagesForJuzCount(juz) {
  return juz >= 30 ? TOTAL_PAGES : TOTAL_PAGES - JUZ_START_PAGES[30 - juz] + 1;
}

function statusRoll(rng, studentIdx) {
  // طلاب قليلو الحضور: كل خامس عشر طالب
  const lowAttender = studentIdx % 15 === 7;
  const r = rng();
  if (lowAttender) return r < 0.3 ? "absent" : r < 0.4 ? "excused" : r < 0.5 ? "late" : "present";
  return r < 0.04 ? "absent" : r < 0.08 ? "excused" : r < 0.11 ? "late" : "present";
}

function wardStatus(rng, date, today) {
  const recent = date > addDays(today, -3);
  const r = rng();
  if (recent) return r < 0.55 ? "new" : "approved";
  if (r < 0.03) return "new";
  if (r < 0.06) return "seen";
  if (r < 0.08) return "needs_revision";
  return "approved";
}

/**
 * الخطة الكاملة: كل ما سيُنشأ، بمفاتيح رمزية (halaqahKey…) بلا معرّفات قاعدة بيانات.
 * @param {{ today: string, seed?: number }} opts
 */
export function buildPlan({ today, seed = DEFAULT_SEED }) {
  const rng = makeRng(seed);
  const month = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  const days = sessionDays(today, 30);

  const plan = {
    today,
    seed,
    month,
    association: { name: `${DEMO_PREFIX} جمعية تحفيظ القرآن` },
    mosques: MOSQUES.map((m) => ({
      key: m.key,
      name: m.name,
      linkedToAssociation: m.association,
      featuresOn: [...FEATURES_ON],
      featuresOff: [...FEATURES_OFF],
    })),
    halaqat: [],
    teachers: [],
    students: [],
    profiles: [],
    attendance: [],
    wards: [],
    examTypes: [],
    examSessions: [],
    nominations: [],
    results: [],
    feePlans: [],
    fees: [],
    payments: [],
    visits: [],
    registrations: [],
  };

  // — الحلقات والمعلّمون —
  let teacherNo = 0;
  for (const h of HALAQAT) {
    plan.halaqat.push({
      key: h.key, mosque: h.mosque, name: h.name, existingTeacherId: h.existingTeacherId ?? null,
      capacity: h.capacity, level: h.level, minAge: h.minAge, maxAge: h.maxAge,
    });
    if (!h.existingTeacherId) {
      teacherNo++;
      plan.teachers.push({
        key: `teacher-${teacherNo}`,
        halaqah: h.key,
        username: `demo-teacher-${teacherNo}@example.invalid`,
        name: `${DEMO_PREFIX} الأستاذ ${TEACHER_NAMES[teacherNo - 1]}`,
      });
    }
  }

  // — الطلاب: أجزاء محفوظة متنوعة 1..30 موزّعة على كل الطلاب —
  const totalStudents = HALAQAT.reduce((n, h) => n + h.students, 0);
  const juzPool = [];
  for (let i = 0; i < totalStudents; i++) juzPool.push(1 + Math.floor((i * 29) / Math.max(1, totalStudents - 1)));
  for (let i = juzPool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [juzPool[i], juzPool[j]] = [juzPool[j], juzPool[i]];
  }

  let g = 0;
  for (const h of HALAQAT) {
    for (let n = 1; n <= h.students; n++) {
      const id = `dm-${h.key}-${pad2(n)}`;
      const level = h.level ?? "intermediate";
      const age = (h.minAge ?? 8) + Math.floor(rng() * ((h.maxAge ?? 14) - (h.minAge ?? 8) + 1));
      plan.students.push({
        halaqah: h.key, id, index: g, name: `${DEMO_PREFIX} ${studentFullName(g)}`,
        rating: Math.floor(rng() * 6), juz: juzPool[g], birthYear: year - age, level,
      });
      plan.profiles.push({ halaqah: h.key, studentId: id, birthYear: year - age });
      g++;
    }
  }

  // — الحضور والأوراد لكل طالب (آخر ٣٠ يوماً) —
  const baselineDate = addDays(today, -40);
  for (const s of plan.students) {
    const attended = [];
    for (const date of days) {
      const status = statusRoll(rng, s.index);
      const checkin = status === "present" && rng() < 0.4 ? "qr" : null;
      plan.attendance.push({ halaqah: s.halaqah, studentId: s.id, date, status, checkin });
      if (status === "present" || status === "late") attended.push(date);
    }

    // صفحات كل يوم حضور (١ غالباً، ٢ أحياناً)، ثم نحسب خط الأساس قبل ٣٠ يوماً
    const perDay = attended.map(() => (rng() < 0.78 ? 1 : 2));
    const recent = perDay.reduce((a, b) => a + b, 0);
    const target = pagesForJuzCount(s.juz);
    const total = Math.max(target, recent);
    const baselinePages = total - recent;
    const memorizedTop = TOTAL_PAGES; // حفظ تنازلي: آخر المصحف أولاً

    if (baselinePages > 0) {
      const from = memorizedTop - baselinePages + 1;
      const hifz = pageRangeToAyahs(from, memorizedTop);
      plan.wards.push({
        halaqah: s.halaqah, studentId: s.id, date: baselineDate, hifzFrom: from, hifzTo: memorizedTop,
        hifzAyah: hifz, reviewFrom: null, reviewTo: null, reviewAyah: null, status: "approved",
        errorCounts: null, errorScore: null, errorBand: null, segments: [], baseline: true,
      });
    }

    let cursor = memorizedTop - baselinePages; // أعلى صفحة غير محفوظة بعد
    attended.forEach((date, i) => {
      let hifzFrom = null;
      let hifzTo = null;
      let hifzAyah = null;
      if (cursor >= 1) {
        hifzTo = cursor;
        hifzFrom = Math.max(1, cursor - perDay[i] + 1);
        cursor = hifzFrom - 1;
        hifzAyah = pageRangeToAyahs(hifzFrom, hifzTo);
      }
      const reference = hifzTo ?? 1;
      const memorizedAbove = reference + 1; // أول صفحة محفوظة قبل اليوم
      const segments = [];
      if (memorizedAbove <= memorizedTop && hifzTo !== null) {
        const sabqiTo = Math.min(memorizedTop, memorizedAbove + 2);
        segments.push({ track: "sabqi", fromPage: memorizedAbove, toPage: sabqiTo });
        if (memorizedTop - sabqiTo >= 8 && rng() < 0.6) {
          const room = memorizedTop - (sabqiTo + 1) - 3;
          const start = sabqiTo + 1 + Math.floor(rng() * (room + 1));
          segments.push({ track: "manzil", fromPage: start, toPage: start + 3 });
        }
      }
      const segmentsWithAyah = segments.map((seg, k) => ({ order: k + 1, ...seg, ...pageRangeToAyahs(seg.fromPage, seg.toPage) }));
      const first = segmentsWithAyah[0] ?? null;

      const status = wardStatus(rng, date, today);
      let errorCounts = null;
      let errorScore = null;
      let errorBand = null;
      if (status === "approved" && hifzTo !== null && rng() < 0.35) {
        errorCounts = {
          hifz: Math.floor(rng() * 4), hesitation: Math.floor(rng() * 3),
          tajweed: Math.floor(rng() * 4), tashkeel: Math.floor(rng() * 2),
        };
        const graded = gradeErrors(errorCounts);
        errorScore = graded.score;
        errorBand = graded.band;
      }

      plan.wards.push({
        halaqah: s.halaqah, studentId: s.id, date, hifzFrom, hifzTo, hifzAyah,
        reviewFrom: first ? first.fromPage : null, reviewTo: first ? first.toPage : null,
        reviewAyah: first ? { fromSurah: first.fromSurah, fromAyah: first.fromAyah, toSurah: first.toSurah, toAyah: first.toAyah } : null,
        status, errorCounts, errorScore, errorBand, segments: segmentsWithAyah, baseline: false,
      });
    });
  }

  // — الاختبارات (النور والهدى) —
  const examMosques = ["noor", "huda"];
  for (const mosque of examMosques) {
    plan.examTypes.push(
      { key: `${mosque}-t1`, mosque, name: `${DEMO_PREFIX} اختبار جزء واحد`, juzCount: 1, maxScore: 100, passMark: 60 },
      { key: `${mosque}-t5`, mosque, name: `${DEMO_PREFIX} اختبار خمسة أجزاء`, juzCount: 5, maxScore: 100, passMark: 60 },
    );
    plan.examSessions.push(
      { key: `${mosque}-closed`, mosque, date: addDays(today, -12), status: "closed", location: "قاعة الاختبارات" },
      { key: `${mosque}-upcoming`, mosque, date: addDays(today, 8), status: "scheduled", location: "قاعة الاختبارات" },
    );
    const pool = plan.students.filter((s) => HALAQAT.find((h) => h.key === s.halaqah).mosque === mosque);
    const five = pool.filter((s) => s.juz >= 5).slice(0, 2);
    const one = pool.filter((s) => s.juz >= 1 && !five.includes(s)).slice(0, 4);
    const upcoming = pool.filter((s) => !five.includes(s) && !one.includes(s)).slice(0, 2);
    const mk = (s, typeKey, from, to, session, done) => ({
      mosque, halaqah: s.halaqah, studentId: s.id, typeKey, juzFrom: from, juzTo: to, sessionKey: session, status: done ? "done" : "scheduled",
    });
    const fresh = [
      ...one.map((s) => mk(s, `${mosque}-t1`, 30, 30, `${mosque}-closed`, true)),
      ...five.map((s) => mk(s, `${mosque}-t5`, 26, 30, `${mosque}-closed`, true)),
      ...upcoming.map((s) => mk(s, `${mosque}-t1`, 30, 30, `${mosque}-upcoming`, false)),
    ];
    for (const nom of fresh) {
      plan.nominations.push(nom);
      if (nom.status !== "done") continue;
      const errors = {
        jali: Math.floor(rng() * 4), khafi: Math.floor(rng() * 5),
        taraddud: Math.floor(rng() * 6), nisyan: Math.floor(rng() * 3),
      };
      if (plan.results.length % 4 === 3) errors.jali += 8; // رسوب ظاهر
      const deducted = Object.entries(errors).reduce((n, [k, v]) => n + v * EXAM_DEDUCTIONS[k], 0);
      const score = Math.max(0, 100 - deducted);
      plan.results.push({
        mosque, halaqah: nom.halaqah, studentId: nom.studentId, typeKey: nom.typeKey,
        sessionKey: nom.sessionKey, juzFrom: nom.juzFrom, juzTo: nom.juzTo, errors, score, maxScore: 100, passMark: 60, passed: score >= 60,
      });
    }
  }

  // — الرسوم (النور والهدى): الشهر الحالي —
  const todayDay = Number(today.slice(8, 10));
  let receipt = 0;
  for (const mosque of examMosques) {
    plan.feePlans.push({ key: `${mosque}-monthly`, mosque, name: `${DEMO_PREFIX} رسوم شهرية`, amount: 60 });
    const pool = plan.students.filter((s) => HALAQAT.find((h) => h.key === s.halaqah).mosque === mosque);
    pool.forEach((s, i) => {
      const roll = (i * 7 + 3) % 20; // توزيع حتمي: ~٥٥٪ مدفوع، ~١٥٪ جزئي، ~٣٠٪ مستحق
      const status = roll < 11 ? "paid" : roll < 14 ? "partial" : "due";
      const paid = status === "paid" ? 60 : status === "partial" ? 30 : 0;
      plan.fees.push({
        mosque, planKey: `${mosque}-monthly`, halaqah: s.halaqah, studentId: s.id,
        periodLabel: month, amountDue: 60, amountPaid: paid, status, dueDate: `${month}-15`,
      });
      if (paid > 0) {
        receipt++;
        const day = 1 + (i % todayDay);
        plan.payments.push({
          halaqah: s.halaqah, studentId: s.id, planKey: `${mosque}-monthly`, amount: paid,
          paidAt: isoAt(`${month}-${pad2(day)}`, "09:30:00"), method: ["cash", "transfer", "other"][i % 3],
          receiptNo: `DEMO-${month.replace("-", "")}-${String(receipt).padStart(4, "0")}`,
        });
      }
    });
  }

  // — الزيارات الإشرافية —
  plan.visits.push(
    {
      key: "visit-done", mosque: "noor", halaqah: "noor-2", association: true, visitorKind: "association_admin",
      visitorName: `${DEMO_PREFIX} مشرف الجمعية`, scheduledFor: addDays(today, -9), visitedAt: isoAt(addDays(today, -9), "10:00:00"),
      status: "done", overallScore: 84,
      notes: "حلقة منضبطة وتفاعل جيد من الطلاب، والسجلات محدّثة.",
      recommendations: "زيادة وقت المراجعة الجماعية ومتابعة الطلاب المتأخرين في الحضور.",
      scores: VISIT_CRITERIA.map((key, i) => ({ key, score: [5, 4, 4, 4, 5, 4, 3][i], note: "" })),
    },
    {
      key: "visit-scheduled", mosque: "huda", halaqah: "huda-1", association: true, visitorKind: "mosque_admin",
      visitorName: `${DEMO_PREFIX} مدير الجامع`, scheduledFor: addDays(today, 6), visitedAt: null,
      status: "scheduled", overallScore: null, notes: "", recommendations: "", scores: [],
    },
  );

  // — طلبات تسجيل معلّقة في جامع النور —
  plan.registrations = REGISTRANTS.map((r, i) => ({
    mosque: "noor", name: `${DEMO_PREFIX} ${r.first} ${r.second}`, birthYear: year - r.birthAge,
    level: r.level, createdAt: isoAt(addDays(today, -(i + 1) * 2), "18:00:00"),
  }));

  return plan;
}

/** ملخص أرقام وأسماء للطباعة والاختبار */
export function summarizePlan(plan) {
  const wardsByStatus = {};
  for (const w of plan.wards) wardsByStatus[w.status] = (wardsByStatus[w.status] ?? 0) + 1;
  const attByStatus = {};
  for (const a of plan.attendance) attByStatus[a.status] = (attByStatus[a.status] ?? 0) + 1;
  return {
    counts: {
      associations: 1,
      mosques: plan.mosques.length,
      mosque_features: plan.mosques.length * (plan.mosques[0].featuresOn.length + plan.mosques[0].featuresOff.length),
      halaqahs_new: plan.halaqat.filter((h) => !h.existingTeacherId).length,
      halaqahs_linked_existing: plan.halaqat.filter((h) => h.existingTeacherId).length,
      teachers: plan.teachers.length,
      students: plan.students.length,
      student_profiles: plan.profiles.length,
      attendance: plan.attendance.length,
      ward_logs: plan.wards.length,
      ward_review_segments: plan.wards.reduce((n, w) => n + w.segments.length, 0),
      exam_types: plan.examTypes.length,
      exam_sessions: plan.examSessions.length,
      exam_nominations: plan.nominations.length,
      exam_results: plan.results.length,
      fee_plans: plan.feePlans.length,
      student_fees: plan.fees.length,
      fee_payments: plan.payments.length,
      supervisor_visits: plan.visits.length,
      visit_criteria_scores: plan.visits.reduce((n, v) => n + v.scores.length, 0),
      mosque_registrations: plan.registrations.length,
    },
    wardsByStatus,
    attByStatus,
  };
}
