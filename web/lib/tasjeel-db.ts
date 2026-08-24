import "server-only";

import { getDatabase } from "@netlify/database";
import type { Suggestion } from "./db";

/*
  اتصال ثانٍ بقاعدة بيانات نظام تسجيل الطلاب (tasjeel-tullab) — مستقل
  تماماً عن اتصال هذا النظام، يُستخدم فقط لجمع اقتراحات الطلاب في لوحة
  المطوّر الموحّدة. يحتاج متغيّر البيئة TASJEEL_DB_URL (نفس قيمة
  NETLIFY_DB_URL عند tasjeel-tullab).
*/
let tasjeelDb: ReturnType<typeof getDatabase> | null = null;
function db() {
  if (!tasjeelDb) {
    const connectionString = process.env.TASJEEL_DB_URL;
    if (!connectionString) throw new Error("TASJEEL_DB_URL غير مضبوط");
    tasjeelDb = getDatabase({ connectionString });
  }
  return tasjeelDb;
}

export async function listStudentSuggestions(): Promise<Suggestion[]> {
  const rows = await db().sql`
    SELECT id, sender_label, message, type, created_at FROM suggestions ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id as number,
    senderLabel: row.sender_label as string,
    message: row.message as string,
    createdAt: row.created_at as string,
    type: (row.type as Suggestion["type"]) ?? "suggestion",
  }));
}

export type LinkedWard = {
  username: string;
  date: string;
  hifzPages: number | null;
  reviewPages: number | null;
};

/**
 * ورد كل الطلاب المرتبطين بأسماء المستخدمين هذي (اسم مستخدم tasjeel لكل
 * طالب مرتبط بحلقات) — لتقرير أداء الحلقة الشهري. يرجع قائمة فارغة لو
 * ما فيه أسماء أو تعذّر الاتصال، بدل ما يكسر الصفحة كاملة.
 */
export async function listWardsForUsernames(usernames: string[]): Promise<LinkedWard[]> {
  if (usernames.length === 0) return [];
  const rows = await db().sql`
    SELECT s.username, w.date, w.hifz_pages, w.review_pages
    FROM wards w JOIN students s ON s.id = w.student_id
    WHERE s.username = ANY(${usernames})
  `;
  return rows.map((row) => ({
    username: row.username as string,
    date: row.date as string,
    hifzPages: (row.hifz_pages as number | null) ?? null,
    reviewPages: (row.review_pages as number | null) ?? null,
  }));
}
