import "server-only";

import { db } from "./db";
import { RETENTION_RULES, type RetentionResult } from "./retention-rules";

/**
 * ينفّذ قواعد الاحتفاظ واحدةً واحدة. فشل قاعدة (جدول لم تُطبَّق ترحيلته
 * بعد مثلاً) لا يوقف البقية — يُعلَّم بنتيجتها فقط.
 */
export async function runRetentionCleanup(): Promise<RetentionResult[]> {
  const results: RetentionResult[] = [];
  for (const rule of RETENTION_RULES) {
    try {
      const outcome = await db().pool.query(rule.sql);
      results.push({ key: rule.key, label: rule.label, deleted: Number(outcome.rowCount ?? 0) });
    } catch (error) {
      console.error("retention: rule failed", rule.key, error);
      results.push({ key: rule.key, label: rule.label, deleted: 0, error: true });
    }
  }
  return results;
}
