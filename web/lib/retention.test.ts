import { beforeEach, describe, expect, it, vi } from "vitest";
import { RETENTION_RULES } from "./retention-rules";

const query = vi.hoisted(() => vi.fn());
vi.mock("./db", () => ({ db: () => ({ pool: { query } }) }));

const { runRetentionCleanup } = await import("./retention");

describe("retention rules", () => {
  it("كل قاعدة DELETE مقيّد بشرط زمني", () => {
    for (const rule of RETENTION_RULES) {
      expect(rule.sql).toMatch(/^DELETE FROM \w+ WHERE /);
      expect(rule.sql).toMatch(/< now\(\) - interval '\d+ days?'/);
    }
  });

  it("المفاتيح فريدة", () => {
    const keys = RETENTION_RULES.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("طلبات الحذف المعلّقة لا تُمسّ، وإجراءات اللوحة الإدارية لا تُحذف", () => {
    const requests = RETENTION_RULES.find((r) => r.key === "data_deletion_requests")!;
    expect(requests.sql).toContain("status IN ('done', 'rejected')");
    const audit = RETENTION_RULES.filter((r) => r.sql.includes("dev_audit_log"));
    expect(audit).toHaveLength(1);
    expect(audit[0].sql).toContain("action LIKE 'security.%'");
  });
});

describe("runRetentionCleanup", () => {
  beforeEach(() => query.mockReset());

  it("يجمع عدد المحذوف لكل قاعدة ويكمل رغم فشل إحداها", async () => {
    query.mockImplementation(async (sql: unknown) => {
      if (String(sql).includes("rate_limits")) throw new Error("missing table");
      return { rowCount: 2 };
    });
    const results = await runRetentionCleanup();
    expect(results).toHaveLength(RETENTION_RULES.length);
    expect(results.find((r) => r.key === "rate_limits")).toMatchObject({ deleted: 0, error: true });
    expect(results.find((r) => r.key === "password_resets")).toMatchObject({ deleted: 2 });
  });
});
