import { describe, expect, it } from "vitest";
import {
  buildAssociationCsv,
  consolidate,
  csvCell,
  mosqueBelongsToAssociation,
  parseAssociationAdminBody,
  parseAssociationBody,
  parseAssociationPeriod,
  percent,
  type MosqueKpiRow,
} from "./association";

function row(overrides: Partial<MosqueKpiRow> = {}): MosqueKpiRow {
  return {
    mosqueId: 1,
    name: "جامع النور",
    city: "مكة",
    halaqat: 3,
    activeStudents: 40,
    attendanceRate: 90,
    examResults: 10,
    examPassed: 8,
    permits: { active: 2, suspended: 1, withdrawn: 0, pendingRenewal: 0 },
    ...overrides,
  };
}

describe("الانتماء", () => {
  it("الجامع يتبع جمعيته فقط", () => {
    expect(mosqueBelongsToAssociation(5, 5)).toBe(true);
    expect(mosqueBelongsToAssociation(6, 5)).toBe(false);
    expect(mosqueBelongsToAssociation(null, 5)).toBe(false);
  });
});

describe("تجميع المؤشرات", () => {
  it("المجاميع والحضور المرجَّح بعدد الطلاب والتصاريح", () => {
    const totals = consolidate([
      row({ activeStudents: 40, attendanceRate: 90 }),
      row({ mosqueId: 2, activeStudents: 10, attendanceRate: 60, halaqat: 1, examResults: 2, examPassed: 1, permits: null }),
    ]);
    expect(totals).toMatchObject({ mosques: 2, halaqat: 4, activeStudents: 50, examResults: 12, examPassed: 9 });
    expect(totals.attendanceRate).toBe(84); // (90*40 + 60*10) / 50
    expect(totals.permits).toEqual({ active: 2, suspended: 1, withdrawn: 0, pendingRenewal: 0 });
  });

  it("الجوامع بلا حضور مسجَّل لا تدخل المتوسط، وبلا جوامع = أصفار", () => {
    expect(consolidate([row({ attendanceRate: null })]).attendanceRate).toBeNull();
    expect(consolidate([])).toMatchObject({ mosques: 0, halaqat: 0, attendanceRate: null });
  });

  it("النسبة بلا مقام = null", () => {
    expect(percent(1, 0)).toBeNull();
    expect(percent(1, 3)).toBe(33);
  });
});

describe("تصدير CSV", () => {
  it("خلية بفاصلة أو علامة اقتباس تُقتبس", () => {
    expect(csvCell('جامع "الهدى", مكة')).toBe('"جامع ""الهدى"", مكة"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(5)).toBe("5");
  });

  it("خلية تبدأ بمعادلة تُحصَّن (حقن CSV)", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-1+1")).toBe("'-1+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    // الأرقام السالبة الحقيقية (number) لا تُمسّ
    expect(csvCell(-3)).toBe("-3");
  });

  it("الملف يبدأ بـBOM وفيه رأس وصف لكل جامع وصف الإجمالي", () => {
    const csv = buildAssociationCsv([row(), row({ mosqueId: 2, name: "=cmd", permits: null })]);
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("الجامع");
    expect(lines[1].split(",")[0]).toBe("جامع النور");
    expect(lines[2].startsWith("'=cmd")).toBe(true);
    expect(lines[3].startsWith("الإجمالي")).toBe(true);
  });
});

describe("المدخلات", () => {
  it("جمعية: اسم ٢..١٠٠", () => {
    expect(parseAssociationBody({ name: " جمعية النور ", city: "مكة" })).toEqual({ ok: true, name: "جمعية النور", city: "مكة" });
    expect(parseAssociationBody({ name: "ا" }).ok).toBe(false);
    expect(parseAssociationBody({ name: "x".repeat(101) }).ok).toBe(false);
    expect(parseAssociationBody(null).ok).toBe(false);
  });

  it("مدير جمعية: اسم لاتيني صغير وكلمة مرور ٨+", () => {
    expect(parseAssociationAdminBody({ username: " Admin.One ", password: "12345678" })).toEqual({
      ok: true,
      username: "admin.one",
      password: "12345678",
    });
    expect(parseAssociationAdminBody({ username: "ab", password: "12345678" }).ok).toBe(false);
    expect(parseAssociationAdminBody({ username: "مدير", password: "12345678" }).ok).toBe(false);
    expect(parseAssociationAdminBody({ username: "admin", password: "short" }).ok).toBe(false);
  });

  it("الفترة: الافتراضي عند الغياب، والمعطوب أو المقلوب أو الطويل جداً مرفوض", () => {
    const fallback = { from: "2026-09-01", to: "2026-09-30" };
    const p = (qs: string) => parseAssociationPeriod(new URLSearchParams(qs), fallback);
    expect(p("")).toEqual({ ok: true, ...fallback });
    expect(p("from=2026-01-01&to=2026-02-01")).toEqual({ ok: true, from: "2026-01-01", to: "2026-02-01" });
    expect(p("from=2026-01-01").ok).toBe(false);
    expect(p("from=2026-02-30&to=2026-03-01").ok).toBe(false);
    expect(p("from=2026-03-01&to=2026-01-01").ok).toBe(false);
    expect(p("from=2024-01-01&to=2026-01-01").ok).toBe(false);
    expect(p("from=x&to=y").ok).toBe(false);
  });
});
