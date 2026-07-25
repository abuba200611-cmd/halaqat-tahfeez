export type MemorizedRange = {
  from: number;
  to: number;
  /** كم شهراً مضى على حفظه — يُستخدم في تقدير الإتقان الأولي */
  monthsAgo: number;
};

export type Student = {
  id: string;
  name: string;
  group: string;
  ranges: MemorizedRange[];
  /** رقم الجزء ← درجة الإتقان 0..100 */
  mastery: Record<number, number>;
  active: boolean;
};

export type Pair = {
  a: Student;
  b: Student;
  overlapPages: number;
  overlapJuz: number[];
  gap: number;
  score: number;
  /** ثنائية عدّلها المعلّم يدوياً لا الخوارزمية */
  manual?: boolean;
};

export type PairingResult = {
  pairs: Pair[];
  unmatched: Student[];
  candidateCount: number;
  elapsedMs: number;
};

/**
 * ثنائية محتملة بتقاطعها المحسوب. التقاطع لا يتغيّر بتغيّر اليوم،
 * فنحسبه مرة واحدة ونعيد ترتيب الدرجات فقط في كل جلسة.
 */
export type Candidate = {
  a: Student;
  b: Student;
  overlapPages: number;
  overlapJuz: number[];
  gap: number;
  /** الدرجة قبل تعديلات تاريخ الشراكات */
  baseScore: number;
};

/** سجل الجلسات السابقة — يُستخدم لتدوير الشركاء وإنصاف من بقي بلا شريك */
export type PairingHistory = {
  /** كم مرة اقترن هذان الطالبان سابقاً */
  timesPaired?: (aId: string, bId: string) => number;
  /** كم مرة بقي هذا الطالب بلا شريك */
  timesAlone?: (studentId: string) => number;
};

export type PairingSettings = {
  minOverlapPages: number;
  maxMasteryGap: number;
  repeatPenalty: number;
  overlapCap: number;
  /** رفع أولوية من تكرر بقاؤه بلا شريك، عشان يتناوبوا على التسميع للمعلّم */
  alonePriority: number;
};

/** نطاق صفحات في الورد — من صفحة إلى صفحة */
export type PageRange = { from: number; to: number };

export type WardStatus = "new" | "seen" | "approved";

/**
 * سجلّ ورد يومي يرسله الطالب: ما حفظه جديداً وما راجعه.
 * كلاهما اختياري — قد يكون اليوم حفظاً فقط أو مراجعة فقط.
 */
export type WardLog = {
  id: number;
  studentId: string;
  /** اسم الطالب وقت العرض — للوارد عند المعلّم */
  studentName: string;
  /** YYYY-MM-DD */
  date: string;
  hifz: PageRange | null;
  review: PageRange | null;
  note: string;
  status: WardStatus;
  /** وقت الإرسال بتوقيت UTC: YYYY-MM-DD HH:MM:SS */
  createdAt: string;
};

/** هوية الطالب في جلسته — للعرض والربط بالمعلّم */
export type StudentAccount = {
  teacherId: number;
  id: string;
  name: string;
  halaqahName: string;
};

/** اشتراك دفع للإشعارات على جهاز المعلّم */
export type PushSubscriptionData = {
  endpoint: string;
  p256dh: string;
  auth: string;
};
