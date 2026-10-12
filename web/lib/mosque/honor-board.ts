/*
  حسابات لوحة الشرف البحتة (بلا قاعدة بيانات ولا "server-only") —
  ترتيب الحلقات والطلاب من مقاييس نظام المعلّم (تفاعل/حضور/خطة) ومن
  برامج هذا الجامع (تقييم/أوسمة/أسر ولجان/أنشطة). المطابقة بين طالب
  نظام المعلّم وسجلّات الجامع بالاسم المُطبَّع فقط (لا معرّف مشتركاً)،
  فغير المطابق يظهر بلا درجة برامج ولا يُخفى.
*/

// ————— أنواع مقاييس نظام المعلّم (كما ترجعها /api/link/metrics) —————

export type MetricsPlan = { status: string; progressPct: number } | null;

export type MetricsStudent = {
  id: number;
  name: string;
  wards: number;
  approved: number;
  attendanceRate: number | null;
  streak: number;
  hifzPagesInRange: number;
  reviewPagesInRange: number;
  plan: MetricsPlan;
  recitations: { count: number; avgScore: number | null };
  engagementScore: number;
};

export type HalaqahMetrics = {
  halaqah: { name: string; teacherName: string; activeStudents: number };
  totals: {
    wardsSubmitted: number;
    wardsApproved: number;
    attendanceRate: number | null;
    planOnTrackRatio: number | null;
    recitations: { count: number; avgScore: number | null };
    hifzPagesInRange: number;
  };
  students: MetricsStudent[];
};

// ————— تطبيع الأسماء العربية للمطابقة —————

const TATWEEL = /\u0640/g; // ـ
const DIACRITICS = /[\u064B-\u065F\u0670]/g; // التشكيل والشدّة والسكون…

/**
 * اسم مُطبَّع للمطابقة بين النظامين: حذف التطويل والتشكيل والفراغات (فراغ
 * «عبد الله/عبدالله» اختلاف كتابة لا اختلاف شخص)، وتوحيد صور الألف والياء
 * والتاء المربوطة — فـ«فاطِمـة» و«فاطمه» اسم واحد. المطابقة تظل داخل الحلقة
 * الواحدة فالمجال ضيق ولا يخشى التشابه.
 */
export function normalizeStudentName(name: string): string {
  return name
    .replace(TATWEEL, "")
    .replace(DIACRITICS, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\s+/g, "")
    .toLowerCase();
}

// ————— درجة الحلقة —————

/** أوزان درجة الحلقة: متوسط تفاعل الطلاب (من نظام المعلّم) + حضور + خطة على المسار */
export const HALAQAH_ENGAGEMENT_WEIGHT = 0.7;
export const HALAQAH_ATTENDANCE_WEIGHT = 0.2;
export const HALAQAH_PLAN_WEIGHT = 0.1;

/** متوسط موزون للأجزاء المتوفرة فقط — الجزء null يُسقط ووزنه يُعاد توزيعه */
function weightedAverage(parts: { value: number; weight: number }[]): number | null {
  const available = parts.filter((part) => part.weight > 0);
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight === 0) return null;
  return available.reduce((sum, part) => sum + part.value * part.weight, 0) / totalWeight;
}

/** درجة الحلقة 0-100: تفاعل طلابها وحضورها وخطتها — null لو لا شيء متوفر */
export function halaqahScore(metrics: HalaqahMetrics): number | null {
  const engagement =
    metrics.students.length > 0
      ? metrics.students.reduce((sum, student) => sum + clampScore(student.engagementScore), 0) /
        metrics.students.length
      : null;
  const attendance =
    metrics.totals.attendanceRate === null ? null : clampScore(metrics.totals.attendanceRate);
  const plan =
    metrics.totals.planOnTrackRatio === null ? null : clampScore(metrics.totals.planOnTrackRatio * 100);

  const score = weightedAverage([
    { value: engagement ?? 0, weight: engagement === null ? 0 : HALAQAH_ENGAGEMENT_WEIGHT },
    { value: attendance ?? 0, weight: attendance === null ? 0 : HALAQAH_ATTENDANCE_WEIGHT },
    { value: plan ?? 0, weight: plan === null ? 0 : HALAQAH_PLAN_WEIGHT },
  ]);
  return score === null ? null : Math.round(score);
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value));
}

// ————— ترتيب الحلقات —————

export type HalaqahRankInput = {
  halaqahId: number;
  name: string;
  teacherName: string;
  /** مقاييس الفترة — null لو تعذّر جلبها من نظام المعلّم */
  metrics: HalaqahMetrics | null;
};

export type HalaqahRankRow = {
  rank: number | null;
  halaqahId: number;
  name: string;
  teacherName: string;
  available: boolean;
  score: number | null;
  activeStudents: number | null;
  avgEngagement: number | null;
  attendanceRate: number | null;
  planOnTrackRatio: number | null;
  wardsApproved: number | null;
  hifzPages: number | null;
};

/**
 * ترتيب حلقات الجامع تنازلياً بالدرجة (المتساوون بدرجة يأخذون ترتيباً
 * واحداً)، والحلقات المتعذّرة آخر القائمة بلا ترتيب — لا تُخفى ولا تكسر البقية.
 */
export function rankHalaqahs(inputs: HalaqahRankInput[]): HalaqahRankRow[] {
  const rows = inputs.map((input): HalaqahRankRow => {
    const { metrics } = input;
    const students = metrics?.students ?? [];
    const avgEngagement =
      metrics === null || students.length === 0
        ? null
        : Math.round(students.reduce((sum, s) => sum + clampScore(s.engagementScore), 0) / students.length);
    return {
      rank: null,
      halaqahId: input.halaqahId,
      name: input.name,
      teacherName: metrics?.halaqah.teacherName || input.teacherName,
      available: metrics !== null,
      score: metrics === null ? null : halaqahScore(metrics),
      activeStudents: metrics?.halaqah.activeStudents ?? null,
      avgEngagement,
      attendanceRate: metrics?.totals.attendanceRate ?? null,
      planOnTrackRatio: metrics?.totals.planOnTrackRatio ?? null,
      wardsApproved: metrics?.totals.wardsApproved ?? null,
      hifzPages: metrics?.totals.hifzPagesInRange ?? null,
    };
  });

  const ranked = rows
    .filter((row) => row.score !== null)
    .sort((a, b) => (b.score as number) - (a.score as number) || a.name.localeCompare(b.name, "ar"));
  let rank = 0;
  let previous: number | null = null;
  ranked.forEach((row, index) => {
    if (row.score !== previous) {
      rank = index + 1;
      previous = row.score;
    }
    row.rank = rank;
  });
  return [...ranked, ...rows.filter((row) => row.score === null).sort((a, b) => a.name.localeCompare(b.name, "ar"))];
}

// ————— درجة البرامج (من قاعدة هذا الجامع) —————

/** ما يعرفه الجامع عن طالب مُوزَّع على حلقة — يُطابق بالاسم المُطبَّع */
export type StudentPrograms = {
  pendingId: number;
  halaqahId: number;
  name: string;
  /** نسبة التقييم الأسبوعي من العظمى بالفترة — null لو لا درجات له */
  evaluationPercent: number | null;
  badges: { icon: string; name: string }[];
  inFamily: boolean;
  inCommittee: boolean;
  /** أنشطة الفترة الموسومة بحلقته أو بأسرته */
  activities: number;
};

/** مكونات درجة البرامج: التقييم أهمها، ثم الأوسمة ثم العضوية ثم الأنشطة */
export const PROGRAMS_EVALUATION_WEIGHT = 0.5;
export const PROGRAMS_BADGES_WEIGHT = 0.2;
export const PROGRAMS_MEMBERSHIP_WEIGHT = 0.15;
export const PROGRAMS_ACTIVITIES_WEIGHT = 0.15;
/** عدد الأوسمة/الأنشطة الذي يمنح المكون درجته الكاملة (100) */
export const BADGES_FOR_FULL_MARK = 3;
export const ACTIVITIES_FOR_FULL_MARK = 2;

/**
 * درجة البرامج 0-100: نصفها التقييم الأسبوعي، وخُمسها الأوسمة الممنوحة
 * بالفترة، والباقي عضوية الأسر/اللجان وأنشطة الحلقة/الأسرة. المكون الغائب
 * (لا درجات، لا عضوية…) يُحسب صفراً — ميزة معطّلة عند المسار تُطعم null/0 فلا تؤثر تمييزاً.
 */
export function programsScore(programs: StudentPrograms): number {
  const evaluation = programs.evaluationPercent === null ? 0 : clampScore(programs.evaluationPercent);
  const badges = Math.min(programs.badges.length / BADGES_FOR_FULL_MARK, 1) * 100;
  const membership = (programs.inFamily ? 50 : 0) + (programs.inCommittee ? 50 : 0);
  const activities = Math.min(programs.activities / ACTIVITIES_FOR_FULL_MARK, 1) * 100;
  return Math.round(
    evaluation * PROGRAMS_EVALUATION_WEIGHT +
      badges * PROGRAMS_BADGES_WEIGHT +
      membership * PROGRAMS_MEMBERSHIP_WEIGHT +
      activities * PROGRAMS_ACTIVITIES_WEIGHT,
  );
}

// ————— ترتيب الطلاب على مستوى الجامع —————

/** درجة الطالب المجمّعة: 70٪ تفاعل من نظام المعلّم + 30٪ برامج هذا الجامع */
export const STUDENT_ENGAGEMENT_WEIGHT = 0.7;
export const STUDENT_PROGRAMS_WEIGHT = 0.3;

export type StudentRankRow = {
  rank: number;
  name: string;
  halaqahId: number;
  halaqahName: string;
  engagementScore: number;
  attendanceRate: number | null;
  streak: number;
  /** null لو لم يُطابق الطالب بسجلّ برامج بالجامع (المطابقة بالاسم) */
  programsScore: number | null;
  combinedScore: number;
  matched: boolean;
  badges: { icon: string; name: string }[];
};

export type StudentRanking = {
  students: StudentRankRow[];
  /** طلاب نظام المعلّم بلا سجل مطابق بالجامع — للعرض لا للحجب */
  unmatchedCount: number;
};

/**
 * ترتيب طلاب الجامع كلهم (من مقاييس كل حلقة) بالدرجة المجمّعة. الجزء
 * غير المتوفر يُسقط ووزنه يُعاد توزيعه: غير المطابق ببرامج = درجة تفاعله
 * وحدها. المتساوون بالدرجة يأخذون ترتيباً واحداً.
 */
export function rankStudents(
  halaqahs: { halaqahId: number; name: string; metrics: HalaqahMetrics | null }[],
  programs: StudentPrograms[],
): StudentRanking {
  // فهرس برامج الجامع بمفتاح (الحلقة، الاسم المُطبَّع) — التكرار يأخذ الأول
  // اسمان مُطبَّعان متطابقان بالحلقة نفسها = غموض: لا يُنسب أيٌّ من السجلين لأحد (يُعدّان غير مطابقين)
  const programsIndex = new Map<string, StudentPrograms | null>();
  for (const record of programs) {
    const key = `${record.halaqahId}:${normalizeStudentName(record.name)}`;
    programsIndex.set(key, programsIndex.has(key) ? null : record);
  }

  let unmatchedCount = 0;
  const rows: StudentRankRow[] = [];
  for (const halaqah of halaqahs) {
    const students = halaqah.metrics?.students ?? [];
    const nameCounts = new Map<string, number>();
    for (const student of students) {
      const n = normalizeStudentName(student.name);
      nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
    }
    for (const student of students) {
      const normalized = normalizeStudentName(student.name);
      const record =
        (nameCounts.get(normalized) ?? 0) > 1
          ? null // اسم مكرر بمقاييس الحلقة: غموض
          : (programsIndex.get(`${halaqah.halaqahId}:${normalized}`) ?? null);
      if (record === null) unmatchedCount++;

      const engagement = clampScore(student.engagementScore);
      const combined = weightedAverage([
        { value: engagement, weight: STUDENT_ENGAGEMENT_WEIGHT },
        { value: record === null ? 0 : programsScore(record), weight: record === null ? 0 : STUDENT_PROGRAMS_WEIGHT },
      ]);

      rows.push({
        rank: 0,
        name: student.name,
        halaqahId: halaqah.halaqahId,
        halaqahName: halaqah.name,
        engagementScore: Math.round(engagement),
        attendanceRate: student.attendanceRate,
        streak: student.streak,
        programsScore: record === null ? null : programsScore(record),
        combinedScore: Math.round(combined ?? engagement),
        matched: record !== null,
        badges: record?.badges ?? [],
      });
    }
  }

  rows.sort((a, b) => b.combinedScore - a.combinedScore || a.name.localeCompare(b.name, "ar"));
  let rank = 0;
  let previous: number | null = null;
  rows.forEach((row, index) => {
    if (row.combinedScore !== previous) {
      rank = index + 1;
      previous = row.combinedScore;
    }
    row.rank = rank;
  });
  return { students: rows, unmatchedCount };
}
