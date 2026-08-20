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
    SELECT id, sender_label, message, created_at FROM suggestions ORDER BY created_at DESC
  `;
  return rows.map((row) => ({
    id: row.id as number,
    senderLabel: row.sender_label as string,
    message: row.message as string,
    createdAt: row.created_at as string,
  }));
}
