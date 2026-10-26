/*
  سياسة الورد حسب الفئة (001 US2/US4): دوال نقية صرفة — هل يسجّل المعلّم
  عن الطالب، الحالة الابتدائية للورد حسب مسجِّله، حارس التكرار اليومي
  (FR-005)، أهلية «طلب إعادة» على المعتمد (FR-009)، وسقف الرجوع بالتاريخ.
*/
import type { StageProfile } from "./halaqah-stage";
import type { WardStatus } from "./types";

/** من سجّل الورد — NULL بالعمود يُقرأ «student» (الأوراد القديمة كلها للطالب) */
export type WardRecordVia = "student" | "teacher" | "queue";

/** هل يسجّل المعلّم الورد عن الطالب في هذه الفئة؟ — الابتدائي فقط (FR-003) */
export function canTeacherRecord(profile: StageProfile): boolean {
  return profile.teacherRecords;
}

/**
 * الحالة الابتدائية لورد جديد حسب مسجِّله (FR-008): ورد المعلّم/الطابور
 * يُحفظ معتمداً (صادر عمّن سمعه)، وورد الطالب يبدأ new كما اليوم في كل فئة.
 */
export function initialStatusFor(input: { recordedVia: WardRecordVia }): WardStatus {
  return input.recordedVia === "student" ? "new" : "approved";
}

export type SameDayWard = { id: number; date: string; recordedVia: WardRecordVia; status: WardStatus };

/**
 * حارس التكرار اليومي (FR-005): أقدم ورد لنفس الطالب بنفس اليوم يُعدّ
 * تكراراً — ما لم يكن بحالة needs_revision (المحاولة المرفوضة تُستأنف
 * بمحاولة جديدة فلا تحجب الإرسال). عند تسجيل المعلّم/الطابور: أي ورد
 * قائم ذلك اليوم تكرار؛ عند إرسال الطالب: ورد المعلّم/الطابور فقط
 * (ورده هو لا يمنعه — التعديل متاح له من مساره).
 */
export function findSameDayDuplicate(existing: SameDayWard[], attempt: { date: string; via: WardRecordVia }): SameDayWard | null {
  const duplicates = existing.filter(
    (w) =>
      w.date === attempt.date &&
      w.status !== "needs_revision" &&
      (attempt.via !== "student" || w.recordedVia !== "student"),
  );
  if (duplicates.length === 0) return null;
  return duplicates.reduce((oldest, w) => (w.id < oldest.id ? w : oldest));
}

/**
 * هل يقبل ورد معتمد «طلب إعادة»؟ (FR-009) — قرار المالك Q1 (ب): كل ورد
 * معتمد يبقى قابلاً لإعادة الفتح من المعلّم بملاحظة، أيّاً كان مسجِّله
 * (طالب أو معلّم أو طابور). غير المعتمد لا يُفتح.
 */
export function canReopen(input: { status: WardStatus; recordedVia?: WardRecordVia | null }): boolean {
  return input.status === "approved";
}

/** أقصى رجوع بالتاريخ عند تسجيل ورد عن طالب — ٣ أيام (عقد teacher-wards) */
export const MAX_BACKDATE_DAYS = 3;

/** يقيّص أي مدخل رجوع بالتاريخ إلى عدد أيام صحيح بين ٠ و٣ — غير المفهوم صفر */
export function clampBackdateDays(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), MAX_BACKDATE_DAYS);
}
