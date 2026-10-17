import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERMITS_CONFIG,
  academicYearOf,
  academicYearStart,
  addDaysISO,
  applyPermitAction,
  computePermitSuggestions,
  mergePermitsConfig,
  parsePermitsConfigBody,
  renewalWindow,
  type HalaqahPermitState,
  type PermitRecord,
} from "./permits";

const CONFIG = DEFAULT_PERMITS_CONFIG;

function permit(overrides: Partial<PermitRecord> = {}): PermitRecord {
  return { academicYear: 1448, status: "active", issuedAt: "2026-08-20", renewalDue: null, suspensionsCount: 0, ...overrides };
}

function halaqah(overrides: Partial<HalaqahPermitState> = {}): HalaqahPermitState {
  return {
    halaqahId: 1,
    name: "حلقة الفجر",
    activeStudents: 15,
    permit: permit(),
    everHadPermit: true,
    priorWithdrawn: false,
    ...overrides,
  };
}

const MOSQUE_SMALL = { activeStudents: 15, halaqatCount: 1, upgradeRequestedThisYear: false };

describe("العام الدراسي وأسبوع التجديد", () => {
  it("بداية العام الدراسي = أول يوم من الشهر المضبوط، والعام يُحسب من الشهر الهجري", () => {
    const start = academicYearStart(1448, CONFIG);
    expect(academicYearOf(start, CONFIG)).toBe(1448);
    expect(academicYearOf(addDaysISO(start, -1), CONFIG)).toBe(1447);
    expect(academicYearOf(addDaysISO(start, 100), CONFIG)).toBe(1448);
  });

  it("أسبوع التجديد = الأسبوع الثالث: من اليوم ١٥ إلى ٢١ من بداية العام", () => {
    const start = academicYearStart(1448, CONFIG);
    expect(renewalWindow(1448, CONFIG)).toEqual({ start: addDaysISO(start, 14), end: addDaysISO(start, 20) });
  });

  it("أسبوع التجديد قابل للضبط", () => {
    const start = academicYearStart(1448, { ...CONFIG, renewalWeek: 1 });
    expect(renewalWindow(1448, { ...CONFIG, renewalWeek: 1 }).start).toBe(start);
  });
});

describe("اقتراحات التصاريح", () => {
  const start = academicYearStart(1448, CONFIG);
  const window = renewalWindow(1448, CONFIG);

  it("حلقة فعّالة بطلاب كافين: لا اقتراح", () => {
    const out = computePermitSuggestions({ today: window.start, config: CONFIG, halaqat: [halaqah()], mosque: MOSQUE_SMALL });
    expect(out).toEqual([]);
  });

  it("أقل من ١٠ طلاب فعّالين لتصريح فعّال: يُقترح الإيقاف (يدوي)", () => {
    const out = computePermitSuggestions({
      today: addDaysISO(start, 30),
      config: CONFIG,
      halaqat: [halaqah({ activeStudents: 9 })],
      mosque: MOSQUE_SMALL,
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "suspend", action: "suspend", halaqahId: 1 });
  });

  it("١٠ طلاب بالضبط لا يستوجب الإيقاف (الحد قابل للضبط)", () => {
    const base = { today: addDaysISO(start, 30), halaqat: [halaqah({ activeStudents: 10 })], mosque: MOSQUE_SMALL };
    expect(computePermitSuggestions({ ...base, config: CONFIG })).toEqual([]);
    expect(computePermitSuggestions({ ...base, config: { ...CONFIG, minActiveStudents: 11 } })[0]?.kind).toBe("suspend");
  });

  it("٣ إيقافات بالعام: يُقترح السحب بدل الإيقاف", () => {
    const out = computePermitSuggestions({
      today: addDaysISO(start, 30),
      config: CONFIG,
      halaqat: [halaqah({ activeStudents: 3, permit: permit({ suspensionsCount: 3 }) })],
      mosque: MOSQUE_SMALL,
    });
    expect(out.map((s) => s.kind)).toEqual(["withdraw"]);
    expect(out[0].action).toBe("withdraw");
  });

  it("إيقافان فقط: لا سحب", () => {
    const out = computePermitSuggestions({
      today: addDaysISO(start, 30),
      config: CONFIG,
      halaqat: [halaqah({ permit: permit({ suspensionsCount: 2 }) })],
      mosque: MOSQUE_SMALL,
    });
    expect(out).toEqual([]);
  });

  it("موعد التجديد: قبل الأسبوع الثالث لا اقتراح، وفيه مستحق، وبعده متأخر", () => {
    const noPermit = halaqah({ permit: null });
    const at = (today: string) =>
      computePermitSuggestions({ today, config: CONFIG, halaqat: [noPermit], mosque: MOSQUE_SMALL });
    expect(at(addDaysISO(window.start, -1))).toEqual([]);
    expect(at(window.start)[0]).toMatchObject({ kind: "renew", urgency: "due", action: "issue" });
    expect(at(window.end)[0].urgency).toBe("due");
    expect(at(addDaysISO(window.end, 1))[0].urgency).toBe("overdue");
  });

  it("تصريح بانتظار التجديد يقترح التجديد", () => {
    const out = computePermitSuggestions({
      today: window.start,
      config: CONFIG,
      halaqat: [halaqah({ permit: permit({ status: "pending_renewal" }) })],
      mosque: MOSQUE_SMALL,
    });
    expect(out[0]).toMatchObject({ kind: "renew", action: "renew", urgency: "due" });
  });

  it("حلقة لم يسبق لها تصريح: يُقترح إصداره في أي وقت", () => {
    const out = computePermitSuggestions({
      today: addDaysISO(start, 5),
      config: CONFIG,
      halaqat: [halaqah({ permit: null, everHadPermit: false })],
      mosque: MOSQUE_SMALL,
    });
    expect(out[0]).toMatchObject({ kind: "issue", action: "issue" });
  });

  it("المسحوب لا تُقترح له شيء (هذا العام أو سابقاً)", () => {
    const today = window.start;
    expect(
      computePermitSuggestions({ today, config: CONFIG, halaqat: [halaqah({ permit: permit({ status: "withdrawn" }) })], mosque: MOSQUE_SMALL }),
    ).toEqual([]);
    expect(
      computePermitSuggestions({ today, config: CONFIG, halaqat: [halaqah({ permit: null, priorWithdrawn: true })], mosque: MOSQUE_SMALL }),
    ).toEqual([]);
  });

  it("موقوف استوفى الحد: يُقترح إعادة التفعيل", () => {
    const out = computePermitSuggestions({
      today: addDaysISO(start, 30),
      config: CONFIG,
      halaqat: [halaqah({ activeStudents: 12, permit: permit({ status: "suspended", suspensionsCount: 1 }) })],
      mosque: MOSQUE_SMALL,
    });
    expect(out[0]).toMatchObject({ kind: "reactivate", action: "reactivate" });
  });

  it("الترقية إلى مجمع: ≥ ٥٠ طالباً أو ≥ ٤ حلقات، ولا تتكرر بعد تسجيل الطلب", () => {
    const run = (mosque: typeof MOSQUE_SMALL) =>
      computePermitSuggestions({ today: addDaysISO(start, 30), config: CONFIG, halaqat: [], mosque });
    expect(run({ ...MOSQUE_SMALL, activeStudents: 49, halaqatCount: 3 })).toEqual([]);
    expect(run({ ...MOSQUE_SMALL, activeStudents: 50, halaqatCount: 1 })[0]).toMatchObject({ kind: "upgrade", action: null });
    expect(run({ ...MOSQUE_SMALL, activeStudents: 5, halaqatCount: 4 })[0]?.kind).toBe("upgrade");
    expect(run({ activeStudents: 80, halaqatCount: 6, upgradeRequestedThisYear: true })).toEqual([]);
  });
});

describe("الانتقالات اليدوية", () => {
  const ctx = { today: "2026-09-01", year: 1448, config: CONFIG };

  it("الإصدار ينشئ تصريحاً فعّالاً بلا إيقافات وبموعد تجديد العام التالي", () => {
    const r = applyPermitAction(null, "issue", ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.next).toMatchObject({ status: "active", suspensionsCount: 0, issuedAt: "2026-09-01" });
      expect(r.next.renewalDue).toBe(renewalWindow(1449, CONFIG).start);
    }
  });

  it("الإيقاف يزيد العدّاد، وإعادة التفعيل لا تصفّره", () => {
    const suspended = applyPermitAction(permit(), "suspend", ctx);
    expect(suspended.ok && suspended.next.suspensionsCount).toBe(1);
    if (!suspended.ok) return;
    const back = applyPermitAction(suspended.next, "reactivate", ctx);
    expect(back.ok && back.next).toMatchObject({ status: "active", suspensionsCount: 1 });
  });

  it("دورة التجديد: فعّال ← بانتظار التجديد ← فعّال", () => {
    const pending = applyPermitAction(permit(), "request_renewal", ctx);
    expect(pending.ok && pending.next.status).toBe("pending_renewal");
    if (!pending.ok) return;
    const renewed = applyPermitAction(pending.next, "renew", ctx);
    expect(renewed.ok && renewed.next.status).toBe("active");
  });

  it("انتقالات غير مسموحة تُرفض", () => {
    expect(applyPermitAction(null, "suspend", ctx).ok).toBe(false);
    expect(applyPermitAction(permit(), "issue", ctx).ok).toBe(false);
    expect(applyPermitAction(permit(), "renew", ctx).ok).toBe(false);
    expect(applyPermitAction(permit({ status: "suspended" }), "suspend", ctx).ok).toBe(false);
    expect(applyPermitAction(permit({ status: "active" }), "reactivate", ctx).ok).toBe(false);
  });

  it("المسحوب نهائي", () => {
    const withdrawn = permit({ status: "withdrawn" });
    for (const action of ["renew", "request_renewal", "suspend", "reactivate", "withdraw"] as const) {
      expect(applyPermitAction(withdrawn, action, ctx).ok).toBe(false);
    }
  });

  it("السحب مسموح من أي حالة غير مسحوبة", () => {
    for (const status of ["active", "suspended", "pending_renewal"] as const) {
      const r = applyPermitAction(permit({ status }), "withdraw", ctx);
      expect(r.ok && r.next.status).toBe("withdrawn");
    }
  });
});

describe("إعدادات التصاريح", () => {
  it("الافتراضيات المطلوبة: أسبوع ٣، حد ١٠، سحب بعد ٣، ترقية ٥٠ طالباً أو ٤ حلقات", () => {
    expect(mergePermitsConfig(undefined)).toMatchObject({
      renewalWeek: 3,
      minActiveStudents: 10,
      withdrawalAfterSuspensions: 3,
      upgradeMinStudents: 50,
      upgradeMinHalaqat: 4,
    });
  });

  it("المخزون التالف يسقط على الافتراضي والجزئي يُدمج", () => {
    expect(mergePermitsConfig({ minActiveStudents: "كثير", renewalWeek: 5 })).toMatchObject({
      minActiveStudents: 10,
      renewalWeek: 5,
    });
    expect(mergePermitsConfig("x")).toEqual(CONFIG);
  });

  it("جسم PUT: القيم خارج الحدود أو غير الصحيحة تُرفض صراحة", () => {
    expect(parsePermitsConfigBody({ minActiveStudents: 0 }).ok).toBe(false);
    expect(parsePermitsConfigBody({ renewalWeek: 2.5 }).ok).toBe(false);
    expect(parsePermitsConfigBody({ academicYearStartMonth: 13 }).ok).toBe(false);
    expect(parsePermitsConfigBody(null).ok).toBe(false);
    const ok = parsePermitsConfigBody({ minActiveStudents: 8 });
    expect(ok.ok && ok.config.minActiveStudents).toBe(8);
  });
});
