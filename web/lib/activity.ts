import "server-only";

import { cookies } from "next/headers";
import { db } from "./db";

/*
  نشاط الحسابات: آخر دخول (كل مسار دخول ناجح) وآخر ظهور (قارئات الجلسات،
  مكبوحة لمرة كل ١٠ دقائق). إحصاء لا تدقيق — فشله لا يعطّل أي طلب أبداً
  (كل شيء داخل try/catch صامت)، والتحديث المشروط بشرط زمني داخل SQL نفسه
  يمنع الكتابة المتزامنة عبر نسخ السيرفر المختلفة حتى لو تجاوز الكبح
  المحلي (لكل نسخة خريطتها).

  أثناء «عرض كـ» لا يُنسب أي نشاط للهدف المنتحَل — الظهور على حسابه من
  جهاز المطوّر ليس دخولاً حقيقياً. (كوكي dev_imp يُفحص هنا لا في
  القارئات — يبقى lib/auth.ts بلا استيراد دائري من dev-impersonation.)
*/

const SEEN_THROTTLE_MS = 10 * 60 * 1000;

/** كبح محلي لكل نسخة سيرفر — يُملأ قبل أي عمل ويُقرأ بلا أي استعلام */
const seenThrottle = new Map<string, number>();

export type ActivityRole = "teacher" | "student" | "parent" | "mosque_admin";

/** مفتاح الصف لكل دور — الذي يحدد جدول التحديث وشروطه */
export type ActivityTarget =
  | { role: "teacher"; teacherId: number }
  | { role: "student"; halaqahId: number; studentId: string }
  | { role: "parent"; parentId: number }
  | { role: "mosque_admin"; adminId: number };

function cacheKey(target: ActivityTarget): string {
  switch (target.role) {
    case "teacher":
      return `teacher:${target.teacherId}`;
    case "student":
      return `student:${target.halaqahId}:${target.studentId}`;
    case "parent":
      return `parent:${target.parentId}`;
    case "mosque_admin":
      return `mosque_admin:${target.adminId}`;
  }
}

/** يسجّل دخولاً ناجحاً الآن — يُستدعى من كل مسار دخول بعد ضبط كوكي الجلسة */
export async function recordLogin(target: ActivityTarget): Promise<void> {
  try {
    switch (target.role) {
      case "teacher":
        await db().sql`UPDATE teachers SET last_login_at = now(), last_seen_at = now() WHERE id = ${target.teacherId}`;
        break;
      case "student":
        await db().sql`UPDATE students SET last_login_at = now(), last_seen_at = now()
          WHERE teacher_id = ${target.halaqahId} AND id = ${target.studentId}`;
        break;
      case "parent":
        await db().sql`UPDATE parents SET last_login_at = now(), last_seen_at = now() WHERE id = ${target.parentId}`;
        break;
      case "mosque_admin":
        await db().sql`UPDATE mosque_admins SET last_login_at = now(), last_seen_at = now() WHERE id = ${target.adminId}`;
        break;
    }
  } catch {
    // نشاط الحساب لا يُفشل الدخول أبداً
  }
}

/** آخر ظهور مكبوح (١٠ دقائق) — يُستدعى من قارئات الجلسات */
export async function recordSeen(target: ActivityTarget): Promise<void> {
  const key = cacheKey(target);
  try {
    const now = Date.now();
    if (now - (seenThrottle.get(key) ?? 0) < SEEN_THROTTLE_MS) return;
    seenThrottle.set(key, now);

    const store = await cookies();
    if (store.get("dev_imp")?.value) return;

    // الشرط الزمني داخل SQL نفسه ضمانٌ ثانٍ: لا كتابة إلا بعد مضي ١٠ دقائق
    switch (target.role) {
      case "teacher":
        await db().sql`UPDATE teachers SET last_seen_at = now()
          WHERE id = ${target.teacherId} AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes')`;
        break;
      case "student":
        await db().sql`UPDATE students SET last_seen_at = now()
          WHERE teacher_id = ${target.halaqahId} AND id = ${target.studentId}
            AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes')`;
        break;
      case "parent":
        await db().sql`UPDATE parents SET last_seen_at = now()
          WHERE id = ${target.parentId} AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes')`;
        break;
      case "mosque_admin":
        await db().sql`UPDATE mosque_admins SET last_seen_at = now()
          WHERE id = ${target.adminId} AND (last_seen_at IS NULL OR last_seen_at < now() - interval '10 minutes')`;
        break;
    }
  } catch {
    // تجاهل صامت — الإحصاء لا يكسر الجلسة
  }
}
