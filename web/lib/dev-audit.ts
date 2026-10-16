import "server-only";

import { db } from "./db";

/*
  M3 — سجل تدقيق لوحة المطوّر. كل إجراء حساس يمرّ من هنا: «عرض كـ»
  (بدء/إنهاء)، تبديل ميزة جامع، إيقاف معلّم، إبطال جلسات، فكّ ربط ولي،
  تغيير حساب مدير جامع. الفشل بالتسجيل لا يُفشل الإجراء نفسه أبداً.
*/

export type DevAuditEntry = {
  id: number;
  at: string;
  action: string;
  targetKind: string;
  targetId: string;
  details: Record<string, unknown>;
};

export async function logDevAction(
  action: string,
  targetKind: string,
  targetId: string | number,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await db().sql`
      INSERT INTO dev_audit_log (action, target_kind, target_id, details)
      VALUES (${action}, ${targetKind}, ${String(targetId)}, ${JSON.stringify(details)}::jsonb)
    `;
  } catch (error) {
    console.error("dev-audit: failed to record action", action, error);
  }
}

/** آخر ٢٠٠ إجراء مسجَّل — الأحدث أولاً — لصفحة «سجل التدقيق» */
export async function listDevAudit(limit = 200): Promise<DevAuditEntry[]> {
  const rows = await db().sql`
    SELECT id, at, action, target_kind, target_id, details
    FROM dev_audit_log
    ORDER BY id DESC
    LIMIT ${limit}
  `;
  return rows.map((row) => ({
    id: Number(row.id),
    at: new Date(row.at as string).toISOString(),
    action: row.action as string,
    targetKind: row.target_kind as string,
    targetId: row.target_id as string,
    details: (row.details as Record<string, unknown>) ?? {},
  }));
}
