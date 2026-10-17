import "server-only";

import { db } from "./db";
import { ensureAssociationAdminIdentity } from "./identity";
import { percent, type MosqueKpiRow, type PermitCounts } from "./association";
import { academicYearOf, mergePermitsConfig, type PermitStatus } from "./permits";

/*
  A3 — طبقة بيانات الجمعيات. الجمعية تقرأ جوامعها فقط: كل استعلام قراءة هنا
  مقيَّد بـ mosques.association_id = معرّف جمعية الجلسة (لا يُقبل معرّف جمعية
  من العميل أبداً)، وكتابة الحسابات والربط لا تُستدعى إلا من لوحة المطوّر.
*/

export type Association = { id: number; name: string; city: string; createdAt: string };
export type AssociationAdmin = {
  id: number;
  associationId: number;
  username: string;
  sessionVersion: number;
};

function rowToAssociation(r: Record<string, unknown>): Association {
  return {
    id: Number(r.id),
    name: r.name as string,
    city: (r.city as string) ?? "",
    createdAt: new Date(r.created_at as string).toISOString(),
  };
}

function rowToAdmin(r: Record<string, unknown>): AssociationAdmin {
  return {
    id: Number(r.id),
    associationId: Number(r.association_id),
    username: r.username as string,
    sessionVersion: Number(r.session_version ?? 0),
  };
}

// ————— الحسابات —————

export async function findAssociationAdminById(id: number): Promise<AssociationAdmin | null> {
  const rows = await db().sql`
    SELECT id, association_id, username, session_version FROM association_admins WHERE id = ${id}
  `;
  return rows[0] ? rowToAdmin(rows[0]) : null;
}

export async function findAssociationAdminByUsername(
  username: string,
): Promise<(AssociationAdmin & { passwordHash: string }) | null> {
  const rows = await db().sql`
    SELECT id, association_id, username, session_version, password_hash
    FROM association_admins WHERE username = ${username}
  `;
  return rows[0] ? { ...rowToAdmin(rows[0]), passwordHash: rows[0].password_hash as string } : null;
}

export async function markAssociationAdminLogin(id: number): Promise<void> {
  try {
    await db().sql`UPDATE association_admins SET last_login_at = now() WHERE id = ${id}`;
  } catch {
    // إحصاء فقط — فشله لا يعطّل الدخول
  }
}

export async function getAssociation(id: number): Promise<Association | null> {
  const rows = await db().sql`SELECT id, name, city, created_at FROM associations WHERE id = ${id}`;
  return rows[0] ? rowToAssociation(rows[0]) : null;
}

export async function listAssociations(): Promise<Association[]> {
  const rows = await db().sql`SELECT id, name, city, created_at FROM associations ORDER BY name`;
  return rows.map(rowToAssociation);
}

export async function createAssociation(name: string, city: string): Promise<Association> {
  const rows = await db().sql`
    INSERT INTO associations (name, city) VALUES (${name}, ${city}) RETURNING id, name, city, created_at
  `;
  return rowToAssociation(rows[0]);
}

export async function updateAssociation(id: number, name: string, city: string): Promise<Association | null> {
  const rows = await db().sql`
    UPDATE associations SET name = ${name}, city = ${city} WHERE id = ${id}
    RETURNING id, name, city, created_at
  `;
  return rows[0] ? rowToAssociation(rows[0]) : null;
}

/** حذف الجمعية: الجوامع تُفَكّ (association_id → NULL) ولا تُحذف، وحسابات مديريها تُحذف معها */
export async function deleteAssociation(id: number): Promise<boolean> {
  const rows = await db().sql`DELETE FROM associations WHERE id = ${id} RETURNING id`;
  return rows.length > 0;
}

export async function listAssociationAdmins(associationId: number): Promise<AssociationAdmin[]> {
  const rows = await db().sql`
    SELECT id, association_id, username, session_version FROM association_admins
    WHERE association_id = ${associationId} ORDER BY username
  `;
  return rows.map(rowToAdmin);
}

export type CreateAdminResult = { ok: true; admin: AssociationAdmin } | { ok: false; error: string };

/** ينشئ مدير جمعية + هويته الموحّدة بترانزاكشن واحدة (user + membership association_admin) */
export async function createAssociationAdmin(
  associationId: number,
  username: string,
  passwordHash: string,
): Promise<CreateAdminResult> {
  const client = await db().pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO association_admins (association_id, username, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO NOTHING
       RETURNING id, association_id, username, session_version`,
      [associationId, username, passwordHash],
    );
    if ((inserted.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "اسم المستخدم محجوز" };
    }
    const admin = rowToAdmin(inserted.rows[0]);
    await ensureAssociationAdminIdentity(client, { id: admin.id, username: admin.username });
    await client.query("COMMIT");
    return { ok: true, admin };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** كلمة مرور جديدة + رفع session_version (تبطل كل جلساته القائمة) */
export async function resetAssociationAdminPassword(adminId: number, passwordHash: string): Promise<boolean> {
  const rows = await db().sql`
    UPDATE association_admins SET password_hash = ${passwordHash}, session_version = session_version + 1
    WHERE id = ${adminId} RETURNING id
  `;
  return rows.length > 0;
}

// ————— ربط الجوامع —————

export async function getMosqueAssociationId(mosqueId: number): Promise<number | null> {
  const rows = await db().sql`SELECT association_id FROM mosques WHERE id = ${mosqueId}`;
  const value = rows[0]?.association_id;
  return typeof value === "number" ? value : null;
}

/** يربط الجامع بجمعية أو يفكّه (null) — false لو الجامع غير موجود */
export async function setMosqueAssociation(mosqueId: number, associationId: number | null): Promise<boolean> {
  const rows = await db().sql`
    UPDATE mosques SET association_id = ${associationId} WHERE id = ${mosqueId} RETURNING id
  `;
  return rows.length > 0;
}

export type AssociationMosque = { id: number; name: string; city: string };

export async function listAssociationMosques(associationId: number): Promise<AssociationMosque[]> {
  const rows = await db().sql`
    SELECT id, name, city FROM mosques WHERE association_id = ${associationId} ORDER BY name
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name as string, city: (r.city as string) ?? "" }));
}

// ————— مؤشرات الجوامع (قراءة فقط) —————

/**
 * مؤشرات كل جوامع الجمعية للفترة [from, to] بعدد استعلامات ثابت (لا N+1):
 * الحضور = (حاضر+متأخر) ÷ (كل التسجيلات عدا «مستأذن»)، والاختبارات بتاريخ
 * الجلسة، والتصاريح لعام كل جامع الدراسي الحالي (وفق إعدادات جامعه) وتظهر
 * فقط إن كانت ميزة permits مفعّلة له.
 */
export async function getAssociationKpis(
  associationId: number,
  range: { from: string; to: string },
  today: string,
): Promise<MosqueKpiRow[]> {
  const [mosques, attendance, exams, permitRows, settings, features] = await Promise.all([
    db().sql`
      SELECT m.id, m.name, m.city,
             (SELECT count(*) FROM halaqahs h WHERE h.mosque_id = m.id)::int AS halaqat,
             (SELECT count(*) FROM students s JOIN halaqahs h ON h.id = s.teacher_id
              WHERE h.mosque_id = m.id AND s.active AND s.deleted_at IS NULL)::int AS active_students
      FROM mosques m WHERE m.association_id = ${associationId} ORDER BY m.name
    `,
    db().sql`
      SELECT h.mosque_id,
             count(*) FILTER (WHERE a.status IN ('present', 'late'))::int AS good,
             count(*) FILTER (WHERE a.status <> 'excused')::int AS counted
      FROM attendance a
      JOIN halaqahs h ON h.id = a.halaqah_id
      JOIN mosques m ON m.id = h.mosque_id
      WHERE m.association_id = ${associationId} AND a.date >= ${range.from} AND a.date <= ${range.to}
      GROUP BY h.mosque_id
    `,
    db().sql`
      SELECT r.mosque_id, count(*)::int AS results, count(*) FILTER (WHERE r.passed)::int AS passed
      FROM exam_results r
      JOIN exam_sessions es ON es.id = r.session_id
      JOIN mosques m ON m.id = r.mosque_id
      WHERE m.association_id = ${associationId}
        AND es.session_date >= ${range.from}::date AND es.session_date <= ${range.to}::date
      GROUP BY r.mosque_id
    `,
    db().sql`
      SELECT h.mosque_id, p.academic_year, p.status
      FROM halaqah_permits p
      JOIN halaqahs h ON h.id = p.halaqah_id
      JOIN mosques m ON m.id = h.mosque_id
      WHERE m.association_id = ${associationId}
    `,
    db().sql`
      SELECT ms.mosque_id, ms.value
      FROM mosque_settings ms JOIN mosques m ON m.id = ms.mosque_id
      WHERE m.association_id = ${associationId} AND ms.key = 'permits'
    `,
    db().sql`
      SELECT mf.mosque_id, mf.enabled
      FROM mosque_features mf JOIN mosques m ON m.id = mf.mosque_id
      WHERE m.association_id = ${associationId} AND mf.feature_key = 'permits'
    `,
  ]);

  const attBy = new Map(attendance.map((r) => [Number(r.mosque_id), r]));
  const examBy = new Map(exams.map((r) => [Number(r.mosque_id), r]));
  const settingsBy = new Map(settings.map((r) => [Number(r.mosque_id), r.value as unknown]));
  const permitsOn = new Map(features.map((r) => [Number(r.mosque_id), r.enabled === true]));

  return mosques.map((m) => {
    const id = Number(m.id);
    const att = attBy.get(id);
    const ex = examBy.get(id);
    let permits: PermitCounts | null = null;
    if (permitsOn.get(id) === true) {
      const year = academicYearOf(today, mergePermitsConfig(settingsBy.get(id)));
      permits = { active: 0, suspended: 0, withdrawn: 0, pendingRenewal: 0 };
      for (const p of permitRows) {
        if (Number(p.mosque_id) !== id || Number(p.academic_year) !== year) continue;
        const status = p.status as PermitStatus;
        if (status === "active") permits.active += 1;
        else if (status === "suspended") permits.suspended += 1;
        else if (status === "withdrawn") permits.withdrawn += 1;
        else if (status === "pending_renewal") permits.pendingRenewal += 1;
      }
    }
    return {
      mosqueId: id,
      name: m.name as string,
      city: (m.city as string) ?? "",
      halaqat: Number(m.halaqat ?? 0),
      activeStudents: Number(m.active_students ?? 0),
      attendanceRate: att ? percent(Number(att.good), Number(att.counted)) : null,
      examResults: ex ? Number(ex.results) : 0,
      examPassed: ex ? Number(ex.passed) : 0,
      permits,
    };
  });
}

export type MosqueHalaqahRow = {
  halaqahId: number;
  name: string;
  teacherNames: string;
  activeStudents: number;
  attendanceRate: number | null;
};

/** حلقات جامع واحد مع طلابها وحضور الفترة — يستدعيه مسار الجمعية بعد التحقق من الانتماء */
export async function listMosqueHalaqahRows(
  mosqueId: number,
  range: { from: string; to: string },
): Promise<MosqueHalaqahRow[]> {
  const rows = await db().sql`
    SELECT h.id, h.name,
           COALESCE((
             SELECT string_agg(COALESCE(NULLIF(t.teacher_name, ''), t.username), '، ' ORDER BY (t.role = 'supervisor') DESC)
             FROM teachers t WHERE t.halaqah_id = h.id AND t.deactivated_at IS NULL
           ), '') AS teacher_names,
           (SELECT count(*) FROM students s
            WHERE s.teacher_id = h.id AND s.active AND s.deleted_at IS NULL)::int AS active_students,
           (SELECT count(*) FILTER (WHERE a.status IN ('present', 'late'))
            FROM attendance a WHERE a.halaqah_id = h.id AND a.date >= ${range.from} AND a.date <= ${range.to})::int AS good,
           (SELECT count(*) FILTER (WHERE a.status <> 'excused')
            FROM attendance a WHERE a.halaqah_id = h.id AND a.date >= ${range.from} AND a.date <= ${range.to})::int AS counted
    FROM halaqahs h WHERE h.mosque_id = ${mosqueId} ORDER BY h.name
  `;
  return rows.map((r) => ({
    halaqahId: Number(r.id),
    name: r.name as string,
    teacherNames: (r.teacher_names as string) ?? "",
    activeStudents: Number(r.active_students ?? 0),
    attendanceRate: percent(Number(r.good ?? 0), Number(r.counted ?? 0)),
  }));
}

export type MosqueAssignmentRow = { id: number; name: string; city: string; associationId: number | null };

/** كل الجوامع مع جمعيتها الحالية — لشاشة الإسناد بلوحة المطوّر */
export async function listMosqueAssignments(): Promise<MosqueAssignmentRow[]> {
  const rows = await db().sql`SELECT id, name, city, association_id FROM mosques ORDER BY name`;
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name as string,
    city: (r.city as string) ?? "",
    associationId: r.association_id === null ? null : Number(r.association_id),
  }));
}
