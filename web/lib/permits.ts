/*
  A3 — تصاريح الحلقات: منطق نقي (بلا قاعدة بيانات) يشاركه الخادم والواجهة
  والاختبارات. كل رقم قابل للضبط لكل جامع من مفتاح "permits" في
  mosque_settings، وهذه الافتراضيات تسري عند غيابه. الاقتراحات لا تُنفَّذ
  تلقائياً أبداً: تظهر بطاقات لمدير الجامع، والتغيير يدوي ومسجَّل.
*/
import { formatMonthKey, hijriMonthRange, hijriPartsOfISO } from "./hijri";

export const PERMITS_FEATURE_KEY = "permits";
export const PERMIT_NOTES_MAX = 500;

export type PermitStatus = "active" | "suspended" | "withdrawn" | "pending_renewal";

export const PERMIT_STATUSES: readonly PermitStatus[] = ["active", "suspended", "withdrawn", "pending_renewal"];

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  active: "فعّال",
  suspended: "موقوف",
  withdrawn: "مسحوب",
  pending_renewal: "بانتظار التجديد",
};

export function isPermitStatus(value: unknown): value is PermitStatus {
  return typeof value === "string" && (PERMIT_STATUSES as readonly string[]).includes(value);
}

// ————— الإعدادات —————

export type PermitsConfig = {
  /** الشهر الهجري (١..١٢) الذي يبدأ به العام الدراسي — الافتراضي ٣ (ربيع الأول) */
  academicYearStartMonth: number;
  /** الأسبوع (من بداية العام الدراسي) الذي يحلّ فيه موعد التجديد */
  renewalWeek: number;
  /** أقل عدد طلاب فعّالين قبل اقتراح إيقاف التصريح */
  minActiveStudents: number;
  /** عدد مرات الإيقاف في العام الذي يُقترح عنده سحب التصريح */
  withdrawalAfterSuspensions: number;
  /** ترقية الحلقة إلى «مجمع»: عدد الطلاب الفعّالين بالجامع */
  upgradeMinStudents: number;
  /** … أو عدد الحلقات بالجامع */
  upgradeMinHalaqat: number;
};

export const DEFAULT_PERMITS_CONFIG: PermitsConfig = {
  academicYearStartMonth: 3,
  renewalWeek: 3,
  minActiveStudents: 10,
  withdrawalAfterSuspensions: 3,
  upgradeMinStudents: 50,
  upgradeMinHalaqat: 4,
};

export const PERMITS_CONFIG_FIELDS: { key: keyof PermitsConfig; label: string; hint: string; min: number; max: number }[] = [
  { key: "academicYearStartMonth", label: "شهر بداية العام الدراسي (هجري)", hint: "افتراضي ٣ — ربيع الأول", min: 1, max: 12 },
  { key: "renewalWeek", label: "أسبوع التجديد من بداية العام", hint: "افتراضي ٣", min: 1, max: 20 },
  { key: "minActiveStudents", label: "أقل عدد طلاب فعّالين للحلقة", hint: "دونه يُقترح الإيقاف — افتراضي ١٠", min: 1, max: 500 },
  { key: "withdrawalAfterSuspensions", label: "عدد الإيقافات قبل اقتراح السحب", hint: "خلال العام — افتراضي ٣", min: 1, max: 20 },
  { key: "upgradeMinStudents", label: "حدّ الطلاب لاقتراح الترقية إلى مجمع", hint: "افتراضي ٥٠", min: 1, max: 5000 },
  { key: "upgradeMinHalaqat", label: "أو حدّ الحلقات لاقتراح الترقية", hint: "افتراضي ٤", min: 1, max: 200 },
];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof num === "number" && Number.isInteger(num) && num >= min && num <= max ? num : fallback;
}

/** يدمج المخزون (JSON جزئي أو تالف) فوق الافتراضي مع تقييد كل قيمة بحدودها */
export function mergePermitsConfig(stored: unknown): PermitsConfig {
  const source = (typeof stored === "object" && stored !== null && !Array.isArray(stored) ? stored : {}) as Record<
    string,
    unknown
  >;
  const out = { ...DEFAULT_PERMITS_CONFIG };
  for (const field of PERMITS_CONFIG_FIELDS) {
    out[field.key] = clampInt(source[field.key], field.min, field.max, DEFAULT_PERMITS_CONFIG[field.key]);
  }
  return out;
}

export type ParsedPermitsConfig = { ok: true; config: PermitsConfig } | { ok: false; error: string };

/** يتحقّق من جسم PUT: كائن يُدمج فوق الافتراضي (الحقول الغائبة تبقى افتراضية) */
export function parsePermitsConfigBody(body: unknown): ParsedPermitsConfig {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "الإعدادات غير صحيحة" };
  }
  const raw = body as Record<string, unknown>;
  for (const field of PERMITS_CONFIG_FIELDS) {
    const value = raw[field.key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value) || value < field.min || value > field.max) {
      return { ok: false, error: `${field.label} لازم يكون رقماً صحيحاً من ${field.min} إلى ${field.max}` };
    }
  }
  return { ok: true, config: mergePermitsConfig(raw) };
}

// ————— العام الدراسي (هجري) —————

export function addDaysISO(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** سنة العام الدراسي (هجرية) التي يقع فيها هذا اليوم: قبل شهر البداية = العام السابق */
export function academicYearOf(iso: string, config: PermitsConfig): number {
  const { year, month } = hijriPartsOfISO(iso);
  return month >= config.academicYearStartMonth ? year : year - 1;
}

/** أول يوم (ميلادي) من العام الدراسي */
export function academicYearStart(year: number, config: PermitsConfig): string {
  return hijriMonthRange(formatMonthKey(year, config.academicYearStartMonth)).start;
}

/** آخر يوم من العام الدراسي = اليوم السابق لبداية العام التالي */
export function academicYearEnd(year: number, config: PermitsConfig): string {
  return addDaysISO(academicYearStart(year + 1, config), -1);
}

/** نافذة أسبوع التجديد: من أول يوم بالأسبوع المضبوط إلى سابع أيامه */
export function renewalWindow(year: number, config: PermitsConfig): { start: string; end: string } {
  const start = addDaysISO(academicYearStart(year, config), (config.renewalWeek - 1) * 7);
  return { start, end: addDaysISO(start, 6) };
}

// ————— الانتقالات اليدوية —————

export type PermitRecord = {
  academicYear: number;
  status: PermitStatus;
  issuedAt: string | null;
  renewalDue: string | null;
  suspensionsCount: number;
};

export type PermitAction = "issue" | "renew" | "request_renewal" | "suspend" | "reactivate" | "withdraw";

export const PERMIT_ACTIONS: readonly PermitAction[] = [
  "issue",
  "renew",
  "request_renewal",
  "suspend",
  "reactivate",
  "withdraw",
];

export const PERMIT_ACTION_LABELS: Record<PermitAction, string> = {
  issue: "إصدار تصريح",
  renew: "تجديد التصريح",
  request_renewal: "بدء التجديد",
  suspend: "إيقاف التصريح",
  reactivate: "إعادة التفعيل",
  withdraw: "سحب التصريح",
};

export function isPermitAction(value: unknown): value is PermitAction {
  return typeof value === "string" && (PERMIT_ACTIONS as readonly string[]).includes(value);
}

export type PermitTransition = { ok: true; next: PermitRecord } | { ok: false; error: string };

/**
 * الانتقال المسموح لإجراء يدوي على تصريح العام الحالي. `current` هو صف هذا
 * العام (أو null إن لم يُصدر بعد). لا يُنفَّذ شيء هنا — الطبقة التالية تحفظ
 * الصف وتسجّل الحدث.
 */
export function applyPermitAction(
  current: PermitRecord | null,
  action: PermitAction,
  ctx: { today: string; year: number; config: PermitsConfig },
): PermitTransition {
  const nextDue = renewalWindow(ctx.year + 1, ctx.config).start;
  const fail = (error: string): PermitTransition => ({ ok: false, error });

  if (action === "issue") {
    if (current) return fail("للحلقة تصريح لهذا العام بالفعل");
    return {
      ok: true,
      next: { academicYear: ctx.year, status: "active", issuedAt: ctx.today, renewalDue: nextDue, suspensionsCount: 0 },
    };
  }
  if (!current) return fail("لا تصريح لهذه الحلقة هذا العام — أصدره أولاً");
  if (current.status === "withdrawn") return fail("التصريح مسحوب ولا يقبل تغييراً");

  switch (action) {
    case "request_renewal":
      if (current.status !== "active") return fail("بدء التجديد لتصريح فعّال فقط");
      return { ok: true, next: { ...current, status: "pending_renewal" } };
    case "renew":
      if (current.status !== "pending_renewal") return fail("التجديد لتصريح بانتظار التجديد فقط");
      return { ok: true, next: { ...current, status: "active", issuedAt: ctx.today, renewalDue: nextDue } };
    case "suspend":
      if (current.status !== "active") return fail("الإيقاف لتصريح فعّال فقط");
      return { ok: true, next: { ...current, status: "suspended", suspensionsCount: current.suspensionsCount + 1 } };
    case "reactivate":
      if (current.status !== "suspended") return fail("إعادة التفعيل لتصريح موقوف فقط");
      return { ok: true, next: { ...current, status: "active" } };
    case "withdraw":
      return { ok: true, next: { ...current, status: "withdrawn" } };
    default:
      return fail("إجراء غير معروف");
  }
}

// ————— الاقتراحات —————

export type HalaqahPermitState = {
  halaqahId: number;
  name: string;
  activeStudents: number;
  /** تصريح العام الدراسي الحالي، أو null */
  permit: PermitRecord | null;
  /** هل سبق للحلقة أي تصريح (أي عام)؟ */
  everHadPermit: boolean;
  /** هل سُحب تصريحها في عام سابق؟ */
  priorWithdrawn: boolean;
};

export type SuggestionKind = "issue" | "renew" | "suspend" | "withdraw" | "reactivate" | "upgrade";
export type SuggestionUrgency = "info" | "due" | "overdue";

export type PermitSuggestion = {
  /** مفتاح ثابت للعرض (kind:halaqahId) */
  id: string;
  kind: SuggestionKind;
  halaqahId: number | null;
  halaqahName: string | null;
  urgency: SuggestionUrgency;
  messageAr: string;
  /** الإجراء اليدوي الذي تنفّذه البطاقة، أو null لبطاقة الترقية (تُسجَّل كطلب ترقية) */
  action: PermitAction | null;
};

export type SuggestionInput = {
  today: string;
  config: PermitsConfig;
  halaqat: HalaqahPermitState[];
  mosque: { activeStudents: number; halaqatCount: number; upgradeRequestedThisYear: boolean };
};

export function computePermitSuggestions(input: SuggestionInput): PermitSuggestion[] {
  const { today, config } = input;
  const year = academicYearOf(today, config);
  const window = renewalWindow(year, config);
  const out: PermitSuggestion[] = [];

  const renewalUrgency: SuggestionUrgency | null = today < window.start ? null : today <= window.end ? "due" : "overdue";

  for (const h of input.halaqat) {
    if (h.priorWithdrawn || h.permit?.status === "withdrawn") continue;
    const push = (kind: SuggestionKind, urgency: SuggestionUrgency, messageAr: string, action: PermitAction) =>
      out.push({ id: `${kind}:${h.halaqahId}`, kind, halaqahId: h.halaqahId, halaqahName: h.name, urgency, messageAr, action });

    if (!h.permit) {
      if (!h.everHadPermit) {
        push("issue", "info", `«${h.name}» بلا تصريح — أصدر تصريحها للعام ${year} هـ`, "issue");
      } else if (renewalUrgency) {
        push(
          "renew",
          renewalUrgency,
          renewalUrgency === "overdue"
            ? `تجديد تصريح «${h.name}» للعام ${year} هـ متأخر (أسبوع التجديد انقضى)`
            : `حلّ موعد تجديد تصريح «${h.name}» للعام ${year} هـ`,
          "issue",
        );
      }
      continue;
    }

    if (h.permit.status === "pending_renewal") {
      push(
        "renew",
        renewalUrgency ?? "info",
        renewalUrgency === "overdue"
          ? `تجديد تصريح «${h.name}» متأخر عن أسبوع التجديد`
          : `تصريح «${h.name}» بانتظار التجديد`,
        "renew",
      );
    }

    if (h.permit.suspensionsCount >= config.withdrawalAfterSuspensions) {
      push(
        "withdraw",
        "due",
        `«${h.name}» أُوقف تصريحها ${h.permit.suspensionsCount} مرات هذا العام — يُقترح سحب التصريح`,
        "withdraw",
      );
    } else if (h.permit.status === "active" && h.activeStudents < config.minActiveStudents) {
      push(
        "suspend",
        "due",
        `«${h.name}» فيها ${h.activeStudents} طالباً فعّالاً فقط (الحد ${config.minActiveStudents}) — يُقترح إيقاف التصريح`,
        "suspend",
      );
    }

    if (h.permit.status === "suspended" && h.activeStudents >= config.minActiveStudents) {
      push(
        "reactivate",
        "info",
        `«${h.name}» استوفت الحد الأدنى للطلاب (${h.activeStudents}) — يمكن إعادة تفعيل تصريحها`,
        "reactivate",
      );
    }
  }

  const { activeStudents, halaqatCount, upgradeRequestedThisYear } = input.mosque;
  if (
    !upgradeRequestedThisYear &&
    (activeStudents >= config.upgradeMinStudents || halaqatCount >= config.upgradeMinHalaqat)
  ) {
    out.push({
      id: "upgrade:mosque",
      kind: "upgrade",
      halaqahId: null,
      halaqahName: null,
      urgency: "info",
      messageAr: `الجامع فيه ${activeStudents} طالباً و${halaqatCount} حلقات — يُقترح رفع طلب ترقية الحلقات إلى «مجمع»`,
      action: null,
    });
  }
  return out;
}
