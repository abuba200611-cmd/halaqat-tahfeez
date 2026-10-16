import "server-only";

import { db } from "./db";

/*
  M3 — استعلامات لوحة المطوّر /dev. قراءة فقط غالباً (نظرة عامة، بحث
  المستخدمين، صحة النظام) + إجراءات المستخدمين التي لا يملكها أي دور
  آخر: إيقاف أي معلّم (حتى المشرفون) وإبطال جلسات أي حساب.
*/

// ————— نظرة عامة —————

export type DevOverview = {
  counts: {
    mosques: number;
    halaqahs: number;
    teachersActive: number;
    studentsActive: number;
    parents: number;
    registrationsPending: number;
    wardsLast7Days: number;
  };
  dbName: string;
  dbSize: string;
  deploy: { commitSha: string | null; commitMessage: string | null };
};

export async function devOverview(): Promise<DevOverview> {
  const rows = await db().sql`
    SELECT
      (SELECT COUNT(*) FROM mosques)::int                                                        AS mosques,
      (SELECT COUNT(*) FROM halaqahs)::int                                                       AS halaqahs,
      (SELECT COUNT(*) FROM teachers WHERE deactivated_at IS NULL)::int                          AS teachers_active,
      (SELECT COUNT(*) FROM students WHERE deleted_at IS NULL)::int                              AS students_active,
      (SELECT COUNT(*) FROM parents)::int                                                        AS parents,
      (SELECT COUNT(*) FROM mosque_registrations WHERE status = 'pending')::int                  AS registrations_pending,
      (SELECT COUNT(*) FROM ward_logs
        WHERE substring(created_at, 1, 10) >= to_char(now() - interval '7 days', 'YYYY-MM-DD'))::int
                                                                                                AS wards_7d,
      pg_size_pretty(pg_database_size(current_database()))                                        AS db_size,
      current_database()                                                                         AS db_name
  `;
  const row = rows[0] ?? {};

  return {
    counts: {
      mosques: Number(row.mosques ?? 0),
      halaqahs: Number(row.halaqahs ?? 0),
      teachersActive: Number(row.teachers_active ?? 0),
      studentsActive: Number(row.students_active ?? 0),
      parents: Number(row.parents ?? 0),
      registrationsPending: Number(row.registrations_pending ?? 0),
      wardsLast7Days: Number(row.wards_7d ?? 0),
    },
    dbName: String(row.db_name ?? ""),
    dbSize: String(row.db_size ?? ""),
    deploy: {
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    },
  };
}

// ————— بحث المستخدمين —————

export type DevUser =
  | {
      kind: "teacher";
      id: number;
      label: string;
      email: string;
      role: string;
      halaqah: string;
      mosque: string | null;
      active: boolean;
    }
  | {
      kind: "student";
      halaqahId: number;
      id: string;
      label: string;
      username: string | null;
      halaqah: string;
      mosque: string | null;
      active: boolean;
    }
  | {
      kind: "parent";
      id: number;
      label: string;
      email: string;
      children: { halaqahId: number; studentId: string; studentName: string }[];
    }
  | {
      kind: "mosque_admin";
      id: number;
      label: string;
      username: string;
      mosque: string;
    };

const SEARCH_LIMIT = 20;

/** بحث موحّد عبر المعلمين والطلاب وأولياء الأمور ومدراء الجوامع — الأدمن فقط */
export async function searchDevUsers(query: string): Promise<DevUser[]> {
  const like = `%${query}%`;

  const [teachers, students, parents, mosqueAdmins] = await Promise.all([
    db().sql`
      SELECT t.id, t.username, t.teacher_name, t.role, t.deactivated_at,
             h.name AS halaqah_name, m.name AS mosque_name
      FROM teachers t
      JOIN halaqahs h ON h.id = t.halaqah_id
      LEFT JOIN mosques m ON m.id = h.mosque_id
      WHERE t.username ILIKE ${like} OR t.teacher_name ILIKE ${like}
      ORDER BY t.id LIMIT ${SEARCH_LIMIT}
    `,
    db().sql`
      SELECT s.teacher_id, s.id, s.name, s.username, s.deleted_at,
             h.name AS halaqah_name, m.name AS mosque_name
      FROM students s
      JOIN halaqahs h ON h.id = s.teacher_id
      LEFT JOIN mosques m ON m.id = h.mosque_id
      WHERE s.name ILIKE ${like} OR s.username ILIKE ${like}
      ORDER BY s.teacher_id, s.id LIMIT ${SEARCH_LIMIT}
    `,
    db().sql`
      SELECT p.id, p.email, p.name,
             COALESCE(json_agg(json_build_object(
               'halaqahId', pc.halaqah_id, 'studentId', pc.student_id, 'studentName', s.name
             )) FILTER (WHERE pc.parent_id IS NOT NULL), '[]') AS children
      FROM parents p
      LEFT JOIN parent_children pc ON pc.parent_id = p.id
      LEFT JOIN students s ON s.teacher_id = pc.halaqah_id AND s.id = pc.student_id
      WHERE p.email ILIKE ${like} OR p.name ILIKE ${like}
      GROUP BY p.id ORDER BY p.id LIMIT ${SEARCH_LIMIT}
    `,
    db().sql`
      SELECT a.id, a.username, m.name AS mosque_name
      FROM mosque_admins a JOIN mosques m ON m.id = a.mosque_id
      WHERE a.username ILIKE ${like} OR m.name ILIKE ${like}
      ORDER BY a.id LIMIT ${SEARCH_LIMIT}
    `,
  ]);

  return [
    ...teachers.map(
      (r): DevUser => ({
        kind: "teacher",
        id: Number(r.id),
        label: (r.teacher_name as string) || (r.username as string),
        email: r.username as string,
        role: r.role as string,
        halaqah: r.halaqah_name as string,
        mosque: (r.mosque_name as string) ?? null,
        active: !r.deactivated_at,
      }),
    ),
    ...students.map(
      (r): DevUser => ({
        kind: "student",
        halaqahId: Number(r.teacher_id),
        id: r.id as string,
        label: r.name as string,
        username: (r.username as string) ?? null,
        halaqah: r.halaqah_name as string,
        mosque: (r.mosque_name as string) ?? null,
        active: !r.deleted_at,
      }),
    ),
    ...parents.map((r): DevUser => {
      // json_agg قد يعود محرَّراً نصاً من التعريف حسب التعريف — نتسامح مع الحالتين
      type ChildRow = { halaqahId: number; studentId: string; studentName: string | null };
      const raw: unknown = r.children;
      const children: ChildRow[] =
        typeof raw === "string" ? (JSON.parse(raw) as ChildRow[]) : ((raw ?? []) as ChildRow[]);
      return {
        kind: "parent",
        id: Number(r.id),
        label: (r.name as string) || (r.email as string),
        email: r.email as string,
        children: children.map((c) => ({
          halaqahId: Number(c.halaqahId),
          studentId: c.studentId,
          studentName: c.studentName ?? c.studentId,
        })),
      };
    }),
    ...mosqueAdmins.map(
      (r): DevUser => ({
        kind: "mosque_admin",
        id: Number(r.id),
        label: r.username as string,
        username: r.username as string,
        mosque: r.mosque_name as string,
      }),
    ),
  ];
}

// ————— إجراءات المستخدمين (من اللوحة فقط) —————

/**
 * إيقاف/تفعيل أي معلّم — حتى المشرفون، بعكس مسار STEP 60 المقيَّد
 * بمساعدي حلقة المستدعي. الإيقاف يرفع نسخة الجلسة فيُسقط جلساته فوراً
 * بنفس نمط setAssistantActive.
 */
export async function setTeacherActiveAny(teacherId: number, active: boolean): Promise<boolean> {
  const rows = active
    ? await db().sql`
        UPDATE teachers SET deactivated_at = NULL WHERE id = ${teacherId} RETURNING id
      `
    : await db().sql`
        UPDATE teachers SET deactivated_at = now(), session_version = session_version + 1
        WHERE id = ${teacherId} RETURNING id
      `;
  return rows.length > 0;
}

/** يبطل كل جلسات طالب برفع نسخة جلسته (المفتاح مركّب: حلقة + طالب) */
export async function bumpStudentSessionVersion(halaqahId: number, studentId: string): Promise<void> {
  await db().sql`
    UPDATE students SET session_version = session_version + 1
    WHERE teacher_id = ${halaqahId} AND id = ${studentId}
  `;
}

/** يبطل كل جلسات ولي أمر برفع نسخة جلسته */
export async function bumpParentSessionVersion(parentId: number): Promise<void> {
  await db().sql`UPDATE parents SET session_version = session_version + 1 WHERE id = ${parentId}`;
}

// ————— صحة النظام —————

export type HealthData = {
  dbSize: string;
  rateLimits: { key: string; total: number }[];
  tableSizes: { table: string; size: string }[];
};

/** مفاتيح rate_limits الأكثر استهلاكاً اليوم + أكبر ١٥ جدولاً بالحجم */
export async function devHealth(): Promise<HealthData> {
  const [sizes, rateRows, tableRows] = await Promise.all([
    db().sql`SELECT pg_size_pretty(pg_database_size(current_database())) AS size`,
    db().sql`
      SELECT key, SUM(count)::int AS total
      FROM rate_limits
      WHERE window_start >= date_trunc('day', now())
      GROUP BY key ORDER BY total DESC LIMIT 15
    `,
    db().sql`
      SELECT c.relname AS table_name,
             pg_size_pretty(pg_total_relation_size(c.oid)) AS size,
             pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY bytes DESC LIMIT 15
    `,
  ]);

  return {
    dbSize: String(sizes[0]?.size ?? ""),
    rateLimits: rateRows.map((r) => ({ key: r.key as string, total: Number(r.total ?? 0) })),
    tableSizes: tableRows.map((r) => ({ table: r.table_name as string, size: r.size as string })),
  };
}
