import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/*
  M5 — فحوص بنيوية لترحيل الهوية الموحّدة (لا اتصال بقاعدة بيانات): كل
  جملة INSERT في الـbackfill يجب أن تحمي نفسها بـON CONFLICT DO NOTHING
  (إضافي/متكرر التشغيل)، لا تعديل ولا حذف لأي جدول قائم، ومسار المعلّمين
  يسبق مسار الأولياء (شرط دمج البريد الواحد بعضويتين). قواعد المطابقة
  النقية نفسها مُختبَرة في lib/identity-mapping.test.ts.
*/

const MIGRATION_PATH = fileURLToPath(
  new URL("../netlify/database/migrations/20261027000000_unified_identity/migration.sql", import.meta.url),
);
const sql = readFileSync(MIGRATION_PATH, "utf8");

describe("ترحيل unified_identity — ثوابت بنيوية", () => {
  it("كل INSERT مصحوب بـ ON CONFLICT DO NOTHING (متكرر التشغيل)", () => {
    const statements = sql
      .split(";")
      .map((s) => s.replace(/--[^\n]*/g, "").trim())
      .filter((s) => s.toUpperCase().includes("INSERT INTO"));
    // ٥ مسارات backfill، كل مسار بيان واحد (WITH ... INSERT users + INSERT memberships)
    expect(statements).toHaveLength(5);
    for (const statement of statements) {
      expect(statement.toUpperCase()).toContain("ON CONFLICT");
      expect(statement.toUpperCase()).toContain("DO NOTHING");
    }
  });

  it("إضافي بالكامل: لا DROP ولا TRUNCATE ولا DELETE ولا UPDATE لأي جدول", () => {
    // ON DELETE CASCADE فعلُ إسنادٍ على الجدول الجديد نفسه وليس جملة حذف
    const stripped = sql.replace(/--[^\n]*/g, "").replace(/ON DELETE CASCADE/gi, "");
    expect(stripped).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE)\b/i);
  });

  it("مسار المعلّمين يسبق مسار الأولياء (بريد واحد = مستخدم واحد بعضويتين)", () => {
    const teacherPass = sql.indexOf("m.legacy_kind = 'teacher' AND m.legacy_id = t.id::text");
    const parentPass = sql.indexOf("m.legacy_kind = 'parent' AND m.legacy_id = p.id::text");
    expect(teacherPass).toBeGreaterThan(-1);
    expect(parentPass).toBeGreaterThan(teacherPass);
  });

  it("كل مسار backfill يتخطى من له عضوية أصلاً (NOT EXISTS على مفتاح legacy)", () => {
    const notExistsCount = (sql.match(/NOT EXISTS \(\s*SELECT 1 FROM memberships/g) ?? []).length;
    expect(notExistsCount).toBe(5); // معلّم، ولي، مدير جامع، طالب، مشرف عام
  });

  it("جدولا users/memberships بلا أي FK نحو الجداول القديمة (لا تعطيل لحذف/استبدال الطلاب)", () => {
    const tables = sql.slice(0, sql.indexOf("-- ————— backfill"));
    expect(tables).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(tables).toContain("CREATE TABLE IF NOT EXISTS memberships");
    expect(tables).toContain("REFERENCES users(id)");
    expect(tables).not.toMatch(/REFERENCES (teachers|parents|students|mosque_admins|halaqahs|mosques|super_admins)\b/);
  });

  it("قيود الدور ومفتاح العضوية الفريد كما في العقد", () => {
    expect(sql).toContain("CHECK (role IN ('developer', 'mosque_admin', 'supervisor', 'assistant', 'student', 'parent'))");
    expect(sql).toContain("UNIQUE (legacy_kind, legacy_id, role, student_id)");
    expect(sql).toContain("CHECK (email IS NULL OR email = lower(email))");
  });
});
