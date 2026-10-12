/*
  STEP 64 — منطق التلاوات الصوتية الصرف (بلا قاعدة بيانات ولا server-only)،
  فيستورده كل من مسارات API وواجهة التسجيل بالمتصفح فلا تتكرر الحدود ولا
  رسائل التحقق بمكانين.
*/
import { isValidSurah, surahAyahCount, surahName } from "./quran-surahs";

export const RECITATION_MAX_SECONDS = 180;
export const RECITATION_MAX_BYTES = 3 * 1024 * 1024;
/** الجسم كاملاً (ملف + حقول النموذج) — دون حد Vercel (٤٫٥MB) بهامش */
export const RECITATION_MAX_REQUEST_BYTES = RECITATION_MAX_BYTES + 256 * 1024;
export const RECITATIONS_PER_DAY = 10;
export const RECITATIONS_KEEP_PER_STUDENT = 10;
export const RECITATION_NOTE_MAX = 500;

export const RECITATION_MIMES = [
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/aac",
  "audio/x-m4a",
] as const;
export type RecitationMime = (typeof RECITATION_MIMES)[number];

export type RecitationStatus = "pending" | "reviewed";

/** تلاوة كما تصل للواجهة — بلا بايتات الصوت (تُجلب من مسار الصوت المنفصل) */
export type RecitationView = {
  id: number;
  studentId: string;
  studentName?: string;
  surah: number;
  fromAyah: number;
  toAyah: number;
  durationSec: number;
  status: RecitationStatus;
  score: number | null;
  teacherNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

/** رابط الصوت — يحرسه مسار GET بالمصادقة (طالب صاحبها، معلّم الحلقة، ولي مرتبط) */
export function recitationAudioUrl(id: number): string {
  return `/api/recitations/${id}/audio`;
}

/** "الملك 1–15" */
export function formatRecitationRange(r: { surah: number; fromAyah: number; toAyah: number }): string {
  const name = surahName(r.surah);
  return r.fromAyah === r.toAyah ? `${name} ${r.fromAyah}` : `${name} ${r.fromAyah}–${r.toAyah}`;
}

/** "2:05" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/*
  فحص النوع الفعلي عبر البايتات الأولى — لا يُوثَق بامتداد الملف ولا بالـmime
  الذي يرسله المتصفح. العائلات: webm (EBML)، ogg (OggS)، mp4/m4a (صندوق ftyp)،
  aac (ADTS)، mp3 (ID3 أو إطار MPEG).
*/
export type AudioFamily = "webm" | "ogg" | "mp4" | "mpeg" | "aac";

export function detectAudioFamily(buffer: Uint8Array): AudioFamily | null {
  const n = buffer.length;
  if (n >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) return "webm";
  if (n >= 4 && buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return "ogg";
  if (n >= 12 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return "mp4";
  if (n >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return "mpeg"; // ID3
  if (n >= 2 && buffer[0] === 0xff) {
    // ADTS: 12 بتاً متزامنة + طبقة 00 → AAC. إطار MPEG: 11 بتاً متزامنة + طبقة ≠ 00 → MP3
    if ((buffer[1] & 0xf6) === 0xf0) return "aac";
    if ((buffer[1] & 0xe0) === 0xe0 && (buffer[1] & 0x06) !== 0) return "mpeg";
  }
  return null;
}

const FAMILY_MIMES: Record<AudioFamily, readonly RecitationMime[]> = {
  webm: ["audio/webm"],
  ogg: ["audio/ogg"],
  mp4: ["audio/mp4", "audio/x-m4a"],
  mpeg: ["audio/mpeg"],
  aac: ["audio/aac"],
};

/** يزيل معاملات النوع ("audio/webm;codecs=opus" → "audio/webm") ويصغّر الحروف */
export function baseMime(declared: string): string {
  return declared.split(";")[0].trim().toLowerCase();
}

export type AudioCheck = { ok: true; mime: RecitationMime } | { ok: false; error: string };

/**
 * يتحقق من بايتات الملف + النوع المُعلَن + الحجم. النوع المُعلَن يجب أن يكون
 * ضمن القائمة المسموحة *ومطابقاً* لما تدلّ عليه البايتات — ملف نصي مُعلَن
 * audio/webm يُرفض، وكذلك ملف mp3 حقيقي مُعلَن audio/webm.
 */
export function validateAudioBytes(buffer: Uint8Array, declaredMime: string): AudioCheck {
  if (buffer.length === 0) return { ok: false, error: "الملف الصوتي فارغ" };
  if (buffer.length > RECITATION_MAX_BYTES) return { ok: false, error: "حجم التلاوة أكبر من 3 ميغابايت" };

  const family = detectAudioFamily(buffer);
  if (!family) return { ok: false, error: "صيغة الملف غير مدعومة — ملف صوتي فقط" };

  const declared = baseMime(declaredMime);
  const allowed = FAMILY_MIMES[family];
  if (!(allowed as readonly string[]).includes(declared)) {
    return { ok: false, error: "صيغة الملف غير مدعومة — ملف صوتي فقط" };
  }
  return { ok: true, mime: declared as RecitationMime };
}

/** مدة التلاوة بالثواني: عدد صحيح من ١ إلى ٣ دقائق */
export function validateDuration(value: unknown): { ok: true; seconds: number } | { ok: false; error: string } {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return { ok: false, error: "مدة التلاوة غير صحيحة" };
  if (n > RECITATION_MAX_SECONDS + 1) return { ok: false, error: "أقصى مدة للتلاوة 3 دقائق" };
  return { ok: true, seconds: Math.min(RECITATION_MAX_SECONDS, Math.round(n)) };
}

export type RecitationRange = { surah: number; fromAyah: number; toAyah: number };

/** سورة واحدة ونطاق آيات ضمن حدودها */
export function validateRecitationRange(
  surah: unknown,
  fromAyah: unknown,
  toAyah: unknown,
): { ok: true; range: RecitationRange } | { ok: false; error: string } {
  const blank = (v: unknown) => v === undefined || v === null || v === "";
  if (blank(surah) || blank(fromAyah) || blank(toAyah)) return { ok: false, error: "اختر السورة والآيات" };
  const s = Number(surah);
  const f = Number(fromAyah);
  const t = Number(toAyah);
  if (!Number.isInteger(s) || !Number.isInteger(f) || !Number.isInteger(t)) {
    return { ok: false, error: "اختر السورة والآيات" };
  }
  if (!isValidSurah(s)) return { ok: false, error: "سورة غير صحيحة" };
  const count = surahAyahCount(s);
  if (f < 1 || t < 1 || f > count || t > count) return { ok: false, error: `سورة ${surahName(s)} فيها ${count} آية` };
  if (t < f) return { ok: false, error: "آخر آية لازم تكون بعد أولها" };
  return { ok: true, range: { surah: s, fromAyah: f, toAyah: t } };
}

/** درجة التقييم: عدد صحيح ١–١٠ */
export function validateScore(value: unknown): { ok: true; score: number } | { ok: false; error: string } {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > 10) {
    return { ok: false, error: "الدرجة من 1 إلى 10" };
  }
  return { ok: true, score: n };
}

/** ملاحظة المعلّم: نص اختياري يُقصّ لحدّه */
export function normalizeTeacherNote(value: unknown): { ok: true; note: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, note: null };
  if (typeof value !== "string") return { ok: false, error: "ملاحظة غير صحيحة" };
  const trimmed = value.trim().slice(0, RECITATION_NOTE_MAX);
  return { ok: true, note: trimmed === "" ? null : trimmed };
}

/**
 * نطاق Range لطلب الصوت ("bytes=0-", "bytes=100-199", "bytes=-500").
 * null = لا Range (أرسل الكل)، "invalid" = غير مُرضٍ (416)، وإلا النطاق الشامل.
 */
export function parseByteRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return "invalid";
  let start: number;
  let end: number;
  if (match[1] === "") {
    const suffix = Number(match[2]);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return { start, end };
}
