import { describe, expect, it } from "vitest";
import { baselineSet, migrationDirNames, pendingMigrations, sortMigrationNames } from "./migrations";

/*
  FR-002 (مايقريشنز بلا Netlify): المنطق النقي لمشغّل المايقريشنز — قراءة
  القرص والاتصال في scripts/migrate.mjs، أما الترتيب وحساب المعلّق
  والتخلّص من غير المايقريشنز فهنالك ليُختبر بلا قاعدة بيانات.
*/

describe("sortMigrationNames — الترتيب المعجمي", () => {
  it("يرتّب الأسماء معجمياً مهما كان ترتيب الإدخال", () => {
    expect(sortMigrationNames(["20260902_login_rate_limit", "20260727_initial", "20260831_step4", "20260727_zz"])).toEqual([
      "20260727_initial",
      "20260727_zz",
      "20260831_step4",
      "20260902_login_rate_limit",
    ]);
  });

  it("يرفض اسماً مكرراً — ترتيب تطبيقه على قاعدتين يصير غامضاً", () => {
    expect(() => sortMigrationNames(["20260727_initial", "20260831_step4", "20260727_initial"])).toThrow(
      "اسم مايقريشن مكرر: 20260727_initial",
    );
  });
});

describe("migrationDirNames — تجاهل ما ليس مجلداً فيه migration.sql", () => {
  function entry(name: string, isDirectory: boolean, hasMigrationSql = false) {
    return { name, isDirectory, hasMigrationSql };
  }

  it("يقبل المجلدات التي فيها migration.sql فقط", () => {
    expect(
      migrationDirNames([
        entry("20260727_initial", true, true),
        entry("20260831_step4", true, true),
      ]),
    ).toEqual(["20260727_initial", "20260831_step4"]);
  });

  it("يتجاهل الملفات السائبة والمجلدات الفارغة من migration.sql", () => {
    expect(
      migrationDirNames([
        entry("README.md", false),
        entry("20260727_initial", true, true),
        entry("draft_notes", true),
        entry(".DS_Store", false),
        entry("20260831_step4", true, true),
      ]),
    ).toEqual(["20260727_initial", "20260831_step4"]);
  });
});

describe("pendingMigrations — المعلّق من قائمة المطبّق", () => {
  const ordered = ["20260727_initial", "20260831_step4", "20260902_login", "20261115_stages"];

  it("يرجع غير المطبّق بترتيب التطبيق نفسه", () => {
    expect(pendingMigrations(ordered, ["20260727_initial", "20260902_login"])).toEqual([
      "20260831_step4",
      "20261115_stages",
    ]);
  });

  it("لا شيء مطبّق: كلها معلّقة", () => {
    expect(pendingMigrations(ordered, [])).toEqual(ordered);
  });

  it("كلها مطبّقة: لا معلّق", () => {
    expect(pendingMigrations(ordered, ordered)).toEqual([]);
  });

  it("سجل فيه دخيل لا يفسد الحساب — يُتجاهل بلا خطأ (ينبّه عليه المشغّل)", () => {
    expect(pendingMigrations(ordered, [...ordered, "20990101_ghost"])).toEqual([]);
  });
});

describe("baselineSet — أساس النقل حتى حدّ --to", () => {
  const ordered = ["20260727_initial", "20260831_step4", "20260902_login", "20261115_stages"];

  it("يشمل كل اسم يرتّب ≤ to شاملاً to نفسه", () => {
    expect(baselineSet(ordered, "20260831_step4")).toEqual(["20260727_initial", "20260831_step4"]);
  });

  it("يستبعد كل ما بعد to — أساس Netlify يقف قبل M1 فيبقى معلّقاً", () => {
    const set = baselineSet(ordered, "20260902_login");
    expect(set).toEqual(["20260727_initial", "20260831_step4", "20260902_login"]);
    expect(set).not.toContain("20261115_stages");
  });

  it("to هو الأول: لا يشمل غيره", () => {
    expect(baselineSet(ordered, "20260727_initial")).toEqual(["20260727_initial"]);
  });

  it("to هو الأخير: يشمل الكل", () => {
    expect(baselineSet(ordered, "20261115_stages")).toEqual(ordered);
  });

  it("يرمي على to غير الموجود في مجلد المايقريشنز", () => {
    expect(() => baselineSet(ordered, "20990101_ghost")).toThrow("اسم مايقريشن غير موجود: 20990101_ghost");
  });

  it("قائمة فارغة: حتى to معروف لا يوجد — يرمي", () => {
    expect(() => baselineSet([], "20260727_initial")).toThrow("اسم مايقريشن غير موجود: 20260727_initial");
  });
});
