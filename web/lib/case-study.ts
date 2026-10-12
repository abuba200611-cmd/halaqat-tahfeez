/*
  STEP 65 — دراسة الحالة: منطق نقي (بلا قاعدة بيانات) يشاركه الخادم
  والواجهة والاختبارات. الدراسة خاصة بمعلّمي الحلقة فقط.
*/
import { daysBeforeISO, isValidAttendanceDate } from "./attendance";
import type { AttendanceSummary } from "./attendance";
import type { PlanStatus } from "./monthly-plan";

export const CASE_TEXT_MAX = 2000;
export const CASE_STATUSES = ["open", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

/** حدّ الحضور (٪) تحت الذي يُرشَّح الطالب، وأقل عدد أيام محسوبة لاعتماد النسبة */
export const SUGGEST_ATTENDANCE_PCT = 70;
export const SUGGEST_MIN_ATTENDANCE_DAYS = 3;
/** عدد الأيام (شاملاً اليوم) بلا ورد قبل الترشيح */
export const SUGGEST_NO_WARD_DAYS = 7;

export const CASE_FIELDS = ["diagnosis", "strengths", "weaknesses", "plan"] as const;
export type CaseField = (typeof CASE_FIELDS)[number];
export type CaseFields = Record<CaseField, string>;

export function isCaseStatus(value: unknown): value is CaseStatus {
  return typeof value === "string" && (CASE_STATUSES as readonly string[]).includes(value);
}

/** معرّف حالة صالح (عدد صحيح موجب) أو null */
export function parseCaseId(value: unknown): number | null {
  const n = typeof value === "string" && /^\d{1,9}$/.test(value) ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isInteger(n) && n >= 1 ? n : null;
}

export type ParsedOpenBody = { ok: true; studentId: string } | { ok: false; error: string };

export function parseOpenBody(body: Record<string, unknown>): ParsedOpenBody {
  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId || studentId.length > 100) return { ok: false, error: "الطالب مفقود" };
  return { ok: true, studentId };
}

export type ParsedFieldsBody = { ok: true; fields: Partial<CaseFields> } | { ok: false; error: string };

const FIELD_LABEL: Record<CaseField, string> = {
  diagnosis: "التشخيص",
  strengths: "نقاط القوة",
  weaknesses: "نقاط الضعف",
  plan: "الخطة العلاجية",
};

/** يتحقّق من جسم PATCH: أي مجموعة من الحقول الأربعة نصوصاً ≤ ٢٠٠٠ حرف؛ حقل واحد على الأقل */
export function parseFieldsBody(body: Record<string, unknown>): ParsedFieldsBody {
  const fields: Partial<CaseFields> = {};
  for (const key of CASE_FIELDS) {
    const value = body[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return { ok: false, error: `${FIELD_LABEL[key]} غير صحيح` };
    if (value.length > CASE_TEXT_MAX) return { ok: false, error: `${FIELD_LABEL[key]} أطول من ${CASE_TEXT_MAX} حرف` };
    fields[key] = value.trim();
  }
  if (Object.keys(fields).length === 0) return { ok: false, error: "لا شيء للتحديث" };
  return { ok: true, fields };
}

export type ParsedActionBody =
  | { ok: true; actionDate: string | null; action: string; result: string | null }
  | { ok: false; error: string };

/** actionDate اختياري (الافتراضي اليوم يحدّده المسار)؛ action مطلوب؛ result اختياري */
export function parseActionBody(body: Record<string, unknown>): ParsedActionBody {
  let actionDate: string | null = null;
  if (body.actionDate !== undefined && body.actionDate !== null) {
    if (!isValidAttendanceDate(body.actionDate)) return { ok: false, error: "تاريخ غير صحيح" };
    actionDate = body.actionDate;
  }
  if (typeof body.action !== "string" || body.action.trim() === "") return { ok: false, error: "الإجراء مفقود" };
  if (body.action.length > CASE_TEXT_MAX) return { ok: false, error: `الإجراء أطول من ${CASE_TEXT_MAX} حرف` };
  let result: string | null = null;
  if (body.result !== undefined && body.result !== null) {
    if (typeof body.result !== "string") return { ok: false, error: "النتيجة غير صحيحة" };
    if (body.result.length > CASE_TEXT_MAX) return { ok: false, error: `النتيجة أطول من ${CASE_TEXT_MAX} حرف` };
    result = body.result.trim() === "" ? null : body.result.trim();
  }
  return { ok: true, actionDate, action: body.action.trim(), result };
}

export type ParsedStatusBody = { ok: true; status: CaseStatus } | { ok: false; error: string };

export function parseStatusBody(body: Record<string, unknown>): ParsedStatusBody {
  if (!isCaseStatus(body.status)) return { ok: false, error: "حالة غير صحيحة" };
  return { ok: true, status: body.status };
}

/* ---------- ترشيح الطلاب المقترح فتح حالة لهم ---------- */

export type SuggestionReason = "behind_plan" | "low_attendance" | "no_ward";

export const SUGGESTION_REASON_LABEL: Record<SuggestionReason, string> = {
  behind_plan: "متأخر عن الخطة الشهرية",
  low_attendance: "حضور أقل من ٧٠٪",
  no_ward: "بلا ورد منذ ٧ أيام",
};

export type SuggestionInput = {
  studentId: string;
  name: string;
  /** حالة الخطة الشهرية الحالية (null بلا خطة) */
  planStatus: PlanStatus | null;
  attendance: Pick<AttendanceSummary, "days" | "presentPct"> | null;
  /** تاريخ آخر ورد YYYY-MM-DD أو null لو لا أوراد */
  lastWardDate: string | null;
};

export type Suggestion = { studentId: string; name: string; reasons: SuggestionReason[] };

/**
 * يرشّح الطلاب الذين ينطبق عليهم شرط واحد على الأقل: متأخر عن الخطة، أو حضور
 * < ٧٠٪ خلال آخر ٣٠ يوماً (بعد ٣ أيام محسوبة على الأقل حتى لا تظلم النسبة طالباً
 * جديداً)، أو بلا ورد خلال آخر ٧ أيام. من له حالة مفتوحة لا يُرشَّح.
 */
export function suggestCandidates(
  rows: SuggestionInput[],
  openCaseStudentIds: Iterable<string>,
  today: string,
): Suggestion[] {
  const open = new Set(openCaseStudentIds);
  const wardSince = daysBeforeISO(today, SUGGEST_NO_WARD_DAYS - 1);
  const out: Suggestion[] = [];
  for (const r of rows) {
    if (open.has(r.studentId)) continue;
    const reasons: SuggestionReason[] = [];
    if (r.planStatus === "behind") reasons.push("behind_plan");
    if (
      r.attendance &&
      r.attendance.days >= SUGGEST_MIN_ATTENDANCE_DAYS &&
      r.attendance.presentPct !== null &&
      r.attendance.presentPct < SUGGEST_ATTENDANCE_PCT
    ) {
      reasons.push("low_attendance");
    }
    if (r.lastWardDate === null || r.lastWardDate < wardSince) reasons.push("no_ward");
    if (reasons.length > 0) out.push({ studentId: r.studentId, name: r.name, reasons });
  }
  return out;
}
