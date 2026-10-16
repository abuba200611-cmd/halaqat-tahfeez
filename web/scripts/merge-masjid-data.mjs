#!/usr/bin/env node
/*
  نقل بيانات نظام الجامع (masjid-idara) إلى قاعدة حلقات التحفيظ — M1.

  الاستخدام:
    MASJID_DB_URL=... NETLIFY_DB_URL=... node scripts/merge-masjid-data.mjs
    MASJID_DB_URL=... NETLIFY_DB_URL=... node scripts/merge-masjid-data.mjs --apply

  الافتراضي --dry-run: يطبع الأعداد لكل جدول وخريطة المعرّفات ولا يكتب شيئاً
  (قراءات فقط من الطرفين). --apply: ينسخ كل شيء داخل معاملة واحدة على اتصال
  واحد مخصَّص من مجمّع الهدف، ويبني خريطة معرّفات (المصدر → الهدف) لكل جدول
  serial ويعيد كتابة كل الروابط عبرها، ثم يتحقق من الأعداد آخر المعاملة —
  أي اختلاف أو خطأ يُتراجع كاملاً (ROLLBACK).

  القواعد:
  - الجوامع: تطابق (الاسم، المدينة) مع جامع قائم بالهدف، وإلا إدراج.
  - حلقات نظام الجامع: تطابق على halaqahs الحقيقية برمز الدعوة (رمز
    الطلاب invite_code أولاً ثم teacher_invite_code). بلا نظير (مثل صفوف
    العرض DEMO-*): يُبلَّغ ويُسكب، وتسجيلاتها تُنسخ «غير موزَّعة»، والأنشطة/
    خانات الجدول الموسومة بها تفقد الوسم/الربط لا الصف.
  - الروابط متعددة الأشكال بلا نظير (فرد/هدف محذوف بالمصدر): صف الرابط
    يُسكب (أفراد الأسر/أعضاء اللجان/الدرجات/منح الأوسمة) أو يُفرَّغ الحقل
    (وسم نشاط، ref_id خانة جدول).
  - إعادة التشغيل آمنة: كل صف منقول مسجَّل بجدول merge_id_map فيُتخطى
    (هجرة 20261024000000 تنشئه — يجب تطبيقها قبل التشغيل).

  البايتات (BYTEA) تُقرأ وتُكتب عبر base64 فتبقى كما هي بأي سائق.
  لا يقرأ السكربت أي ملف .env — المتغيرات من البيئة فقط.
*/

import { getDatabase } from "@netlify/database";
import {
  buildUniqueCodeIndex,
  emptyMergeIdMaps,
  isDemoInviteCode,
  matchHalaqahByInviteCode,
  matchMosqueByNameCity,
  remapActivityTag,
  remapBadgeTargetId,
  remapEvaluationTargetId,
  remapMemberId,
  remapScheduleRef,
  resolveRegistrationAssignment,
  splitPendingRows,
} from "../lib/merge-map.ts";

const apply = process.argv.includes("--apply");
const dryRun = !apply;

const masjidUrl = process.env.MASJID_DB_URL;
const targetUrl = process.env.NETLIFY_DB_URL;
if (!masjidUrl || !targetUrl) {
  console.error("مطلوب متغيرا البيئة MASJID_DB_URL (المصدر) و NETLIFY_DB_URL (الهدف).");
  process.exit(1);
}

const source = getDatabase({ connectionString: masjidUrl });
const targetDb = getDatabase({ connectionString: targetUrl });
const client = await targetDb.pool.connect();

async function finish(code) {
  await client.query("ROLLBACK").catch(() => {}); // no-op بعد COMMIT
  client.release();
  await source.pool.end().catch(() => {});
  await targetDb.pool.end().catch(() => {});
  process.exit(code);
}

async function shutdown() {
  if (!dryRun) await client.query("ROLLBACK").catch(() => {});
  console.error("\nخطأ أثناء النقل — رُوجعت المعاملة كاملة (ROLLBACK).");
  await finish(1);
}

// القراءات من الهدف مباشرة (تعمل بالوضعين)، والكتابات وحدها عبر exec
// التي لا تنفذ شيئاً بالـ dry-run.
async function read(sql, params) {
  const result = await client.query(sql, params);
  return result.rows;
}

/** كتابة على الهدف داخل المعاملة — لا تصدر بالـ dry-run */
async function exec(sql, params) {
  if (dryRun) return [];
  const result = await client.query(sql, params);
  return result.rows;
}

// ————— تحضير: هجرة M1 مطبَّقة؟ ثم خرائط موجودة وقراءة الطرفين —————

const preflight = await read("SELECT to_regclass('merge_id_map') AS t, to_regclass('mosque_registrations') AS r", []);
if (!preflight[0]?.t || !preflight[0]?.r) {
  console.error("جدول merge_id_map أو mosque_registrations غير موجود بالهدف — طبّق هجرة 20261024000000_platform_merge_m1 أولاً.");
  await finish(1);
}

// dry-run: معاملة READ ONLY — يرفض الخادم نفسه أي كتابة
await client.query(dryRun ? "BEGIN READ ONLY" : "BEGIN");

const maps = emptyMergeIdMaps();
// سجل كل جدول serial (الإدماج والتوثيق)، والخرائط التسع أعلاه جزء منه —
// تُشارك نفس نسخ Map.
const book = {
  mosques: maps.mosques,
  mosque_admins: new Map(),
  halaqahs: maps.halaqahs,
  pending_students: maps.pendingStudents,
  mosque_members: maps.mosqueMembers,
  brain_notes: new Map(),
  families: maps.families,
  family_members: new Map(),
  committees: maps.committees,
  committee_members: new Map(),
  committee_tasks: new Map(),
  evaluation_criteria: maps.evaluationCriteria,
  evaluations: new Map(),
  activities: maps.activities,
  activity_media: new Map(),
  badges: maps.badges,
  badge_awards: new Map(),
  schedule_slots: new Map(),
};
const TARGET_OF = {
  mosques: "mosques",
  mosque_admins: "mosque_admins",
  halaqahs: "halaqahs",
  pending_students: "mosque_registrations",
  mosque_members: "mosque_members",
  brain_notes: "brain_notes",
  families: "families",
  family_members: "family_members",
  committees: "committees",
  committee_members: "committee_members",
  committee_tasks: "committee_tasks",
  evaluation_criteria: "evaluation_criteria",
  evaluations: "evaluations",
  activities: "activities",
  activity_media: "activity_media",
  badges: "badges",
  badge_awards: "badge_awards",
  schedule_slots: "schedule_slots",
};

for (const row of await read("SELECT source_table, source_id, target_id FROM merge_id_map", [])) {
  const table = book[row.source_table];
  if (table) table.set(Number(row.source_id), Number(row.target_id));
}

const stats = {};
const unmatchedHalaqahs = [];
const newEntries = [];
const newKeys = new Set();

function record(table, sourceId, targetId) {
  book[table].set(sourceId, targetId);
  newEntries.push({ table, sourceId, targetId });
  newKeys.add(`${table}:${sourceId}`);
}

// قراءة المصدر كاملة؛ الأعمدة الزمنية نصّاً (بلا أي تحويل تاريخ/منطقة
// زمنية) والبايتات base64، فينسخ السكربت القيم كما خُزِّنت بالضبط.
const [
  srcMosques, srcAdmins, srcHalaqahs, srcFeatures, srcNotes, srcMembers, srcRegistrations,
  srcFamilies, srcFamilyMembers, srcCommittees, srcCommitteeMembers, srcTasks,
  srcCriteria, srcEvaluations, srcActivities, srcMedia, srcBadges, srcAwards, srcSlots,
] = await Promise.all([
  source.sql`SELECT id, name, city, teacher_join_code, created_at::text AS created_at FROM mosques ORDER BY id`,
  source.sql`SELECT id, mosque_id, username, password_hash, created_at::text AS created_at FROM mosque_admins ORDER BY id`,
  source.sql`SELECT id, mosque_id, halaqah_name, teacher_name, invite_code, created_at::text AS created_at FROM halaqahs ORDER BY id`,
  source.sql`SELECT mosque_id, feature_key, enabled, config FROM mosque_features ORDER BY mosque_id, feature_key`,
  source.sql`SELECT id, mosque_id, slug, title, body, tags, created_at::text AS created_at, updated_at::text AS updated_at FROM brain_notes ORDER BY id`,
  source.sql`SELECT id, mosque_id, name, phone, role_note, created_at::text AS created_at FROM mosque_members ORDER BY id`,
  source.sql`SELECT id, mosque_id, name, phone, status, halaqah_id, created_at::text AS created_at, assigned_at::text AS assigned_at FROM pending_students ORDER BY id`,
  source.sql`SELECT id, mosque_id, name, leader_name, notes, created_at::text AS created_at FROM families ORDER BY id`,
  source.sql`SELECT id, family_id, member_kind, member_id, created_at::text AS created_at FROM family_members ORDER BY id`,
  source.sql`SELECT id, mosque_id, name, description, created_at::text AS created_at FROM committees ORDER BY id`,
  source.sql`SELECT id, committee_id, member_kind, member_id, role, created_at::text AS created_at FROM committee_members ORDER BY id`,
  source.sql`SELECT id, committee_id, title, status, due_date::text AS due_date, created_at::text AS created_at FROM committee_tasks ORDER BY id`,
  source.sql`SELECT id, mosque_id, name, max_score, sort_order, active, created_at::text AS created_at FROM evaluation_criteria ORDER BY id`,
  source.sql`SELECT id, mosque_id, week_start::text AS week_start, target_kind, target_id, criterion_id, score, note, created_at::text AS created_at, updated_at::text AS updated_at FROM evaluations ORDER BY id`,
  source.sql`SELECT id, mosque_id, title, description, activity_date::text AS activity_date, tag_kind, tag_id, created_at::text AS created_at FROM activities ORDER BY id`,
  source.sql`SELECT id, activity_id, mosque_id, kind, mime, encode(bytes, 'base64') AS bytes_b64, size_bytes, url, sort_order, created_at::text AS created_at FROM activity_media ORDER BY id`,
  source.sql`SELECT id, mosque_id, name, icon, description, criteria_note, created_at::text AS created_at FROM badges ORDER BY id`,
  source.sql`SELECT id, badge_id, mosque_id, target_kind, target_id, awarded_at::text AS awarded_at, note, created_at::text AS created_at FROM badge_awards ORDER BY id`,
  source.sql`SELECT id, mosque_id, day_of_week, period, start_time, title, program_kind, ref_id, location, notes, created_at::text AS created_at FROM schedule_slots ORDER BY id`,
]);

const tgtMosques = await read("SELECT id, name, city FROM mosques ORDER BY id", []);
const tgtHalaqahs = await read("SELECT id, invite_code, teacher_invite_code, mosque_id FROM halaqahs ORDER BY id", []);

const mosqueOf = (id) => maps.mosques.get(id) ?? null;

// ————— نسخة عامة: جدول بمعرّف serial يُدرج صفّاً صفّاً ويسجَّل بالخريطة —————
// build ترجع { sql, params } بعد إعادة رسم الروابط، أو null لإسقاط صف
// الرابط كلياً حين لا نظير لهدفه.
async function copyTable(table, rows, build) {
  const { toCopy, alreadyCopied } = splitPendingRows(rows, book[table]);
  stats[table] = { source: rows.length, copyNow: 0, already: alreadyCopied.length, skippedLinks: 0 };
  for (const row of toCopy) {
    const built = build(row);
    if (built === null) {
      stats[table].skippedLinks++;
      continue;
    }
    const rowsOut = await exec(built.sql, built.params);
    record(table, row.id, rowsOut[0] ? Number(rowsOut[0].id) : row.id);
    stats[table].copyNow++;
  }
}

try {
  // ————— ١) الجوامع: تطابق (الاسم، المدينة) أو إدراج —————

  {
    const { toCopy, alreadyCopied } = splitPendingRows(srcMosques, book.mosques);
    stats.mosques = { source: srcMosques.length, copyNow: 0, already: alreadyCopied.length, skippedLinks: 0 };
    for (const mosque of toCopy) {
      const matched = matchMosqueByNameCity(mosque.name, mosque.city, tgtMosques);
      if (matched !== null) {
        if (mosque.teacher_join_code) {
          await exec("UPDATE mosques SET teacher_join_code = COALESCE(teacher_join_code, $2) WHERE id = $1", [matched, mosque.teacher_join_code]);
        }
        record("mosques", mosque.id, matched);
      } else {
        const rowsOut = await exec(
          "INSERT INTO mosques (name, city, teacher_join_code, created_at) VALUES ($1, $2, $3, $4) RETURNING id",
          [mosque.name, mosque.city, mosque.teacher_join_code ?? null, mosque.created_at],
        );
        record("mosques", mosque.id, rowsOut[0] ? Number(rowsOut[0].id) : mosque.id);
        stats.mosques.copyNow++;
      }
    }
  }

  // ————— ٢) مدراء الجوامع: جامع = مدير واحد (تعارض mosque_id = موجود سابقاً) —————

  {
    const { toCopy, alreadyCopied } = splitPendingRows(srcAdmins, book.mosque_admins);
    stats.mosque_admins = { source: srcAdmins.length, copyNow: 0, already: alreadyCopied.length, skippedLinks: 0 };
    for (const admin of toCopy) {
      const mosqueId = mosqueOf(admin.mosque_id);
      if (mosqueId === null) {
        stats.mosque_admins.skippedLinks++;
        continue; // لا يحدث عملياً: الجوامع كلها فوق
      }
      const rowsOut = await exec(
        `INSERT INTO mosque_admins (mosque_id, username, password_hash, created_at)
         VALUES ($1, $2, $3, $4) ON CONFLICT (mosque_id) DO NOTHING RETURNING id`,
        [mosqueId, admin.username, admin.password_hash, admin.created_at],
      );
      let targetId = rowsOut[0] ? Number(rowsOut[0].id) : null;
      if (targetId === null) {
        // مدير قائم لهذا الجامع أصلاً — نربط الخريطة به بدل الفشل
        const existing = await read("SELECT id FROM mosque_admins WHERE mosque_id = $1", [mosqueId]);
        targetId = existing[0] ? Number(existing[0].id) : admin.id;
      }
      record("mosque_admins", admin.id, targetId);
      stats.mosque_admins.copyNow++;
    }
  }

  // ————— ٣) حلقات نظام الجامع → ربط halaqahs الحقيقية برمز الدعوة —————

  {
    const { toCopy, alreadyCopied } = splitPendingRows(srcHalaqahs, book.halaqahs);
    stats.halaqahs = { source: srcHalaqahs.length, copyNow: 0, already: alreadyCopied.length, skippedLinks: 0 };
    const studentIndex = buildUniqueCodeIndex(tgtHalaqahs.map((h) => ({ id: Number(h.id), code: h.invite_code ?? null })));
    const teacherIndex = buildUniqueCodeIndex(tgtHalaqahs.map((h) => ({ id: Number(h.id), code: h.teacher_invite_code ?? null })));
    const byId = new Map(tgtHalaqahs.map((h) => [Number(h.id), h]));
    for (const halaqah of toCopy) {
      const mosqueId = mosqueOf(halaqah.mosque_id);
      const match = matchHalaqahByInviteCode(halaqah.invite_code, studentIndex, teacherIndex);
      let ok = match !== null && mosqueId !== null;
      if (ok) {
        const linked = byId.get(match.targetId)?.mosque_id;
        // الحلقة مربوطة أصلاً بجامع آخر — لا تُلمس، وتُعامل كغير مطابَقة
        if (linked !== null && linked !== undefined && Number(linked) !== mosqueId) ok = false;
      }
      if (!ok) {
        stats.halaqahs.skippedLinks++;
        unmatchedHalaqahs.push({
          mosque: srcMosques.find((m) => m.id === halaqah.mosque_id)?.name ?? `#${halaqah.mosque_id}`,
          name: halaqah.halaqah_name,
          code: halaqah.invite_code,
          reason: match === null ? (isDemoInviteCode(halaqah.invite_code) ? "demo" : "no-match") : "mosque-conflict",
        });
        continue;
      }
      await exec("UPDATE halaqahs SET mosque_id = $1 WHERE id = $2 AND mosque_id IS NULL", [mosqueId, match.targetId]);
      record("halaqahs", halaqah.id, match.targetId);
      stats.halaqahs.copyNow++;
    }
  }

  // ————— ٤) مزايا الجوامع (بلا معرّف serial: التعارض = منقول سابقاً) —————

  {
    let copied = 0;
    for (const feature of srcFeatures) {
      const mosqueId = mosqueOf(feature.mosque_id);
      if (mosqueId === null) continue;
      await exec(
        `INSERT INTO mosque_features (mosque_id, feature_key, enabled, config, updated_at)
         VALUES ($1, $2, $3, $4::jsonb, now()) ON CONFLICT (mosque_id, feature_key) DO NOTHING`,
        [mosqueId, feature.feature_key, feature.enabled === true, JSON.stringify(feature.config ?? {})],
      );
      copied++;
    }
    stats.mosque_features = { source: srcFeatures.length, copyNow: copied, already: 0, skippedLinks: 0 };
  }

  // ————— ٥) بقية الجداول بترتيب يحترم المفاتيح الأجنبية —————

  await copyTable("brain_notes", srcNotes, (note) => ({
    sql: `INSERT INTO brain_notes (mosque_id, slug, title, body, tags, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5::text[], $6, $7) RETURNING id`,
    params: [mosqueOf(note.mosque_id), note.slug, note.title, note.body, note.tags ?? [], note.created_at, note.updated_at],
  }));

  await copyTable("mosque_members", srcMembers, (member) => ({
    sql: `INSERT INTO mosque_members (mosque_id, name, phone, role_note, created_at)
          VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    params: [mosqueOf(member.mosque_id), member.name, member.phone, member.role_note, member.created_at],
  }));

  // التسجيلات: حلقة بلا نظير (DEMO-) → النسخة «غير موزَّعة»
  {
    const { toCopy, alreadyCopied } = splitPendingRows(srcRegistrations, book.pending_students);
    stats.pending_students = { source: srcRegistrations.length, copyNow: 0, already: alreadyCopied.length, skippedLinks: 0, unassigned: 0 };
    for (const registration of toCopy) {
      const mapped = registration.halaqah_id === null ? null : maps.halaqahs.get(registration.halaqah_id) ?? null;
      const resolved = resolveRegistrationAssignment(
        { halaqahId: registration.halaqah_id, status: registration.status, assignedAt: registration.assigned_at ?? null },
        mapped,
      );
      if (resolved.halaqahId === null && registration.halaqah_id !== null) stats.pending_students.unassigned++;
      const rowsOut = await exec(
        `INSERT INTO mosque_registrations (mosque_id, name, phone, status, halaqah_id, created_at, assigned_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [mosqueOf(registration.mosque_id), registration.name, registration.phone, resolved.status, resolved.halaqahId,
         registration.created_at, resolved.assignedAt],
      );
      record("pending_students", registration.id, rowsOut[0] ? Number(rowsOut[0].id) : registration.id);
      stats.pending_students.copyNow++;
    }
  }

  await copyTable("families", srcFamilies, (family) => ({
    sql: `INSERT INTO families (mosque_id, name, leader_name, notes, created_at)
          VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    params: [mosqueOf(family.mosque_id), family.name, family.leader_name, family.notes, family.created_at],
  }));

  await copyTable("family_members", srcFamilyMembers, (link) => {
    const memberId = remapMemberId(link.member_kind, link.member_id, maps);
    if (memberId === null) return null;
    return {
      sql: `INSERT INTO family_members (family_id, member_kind, member_id, created_at)
            VALUES ($1, $2, $3, $4) RETURNING id`,
      params: [maps.families.get(link.family_id) ?? null, link.member_kind, memberId, link.created_at],
    };
  });

  await copyTable("committees", srcCommittees, (committee) => ({
    sql: `INSERT INTO committees (mosque_id, name, description, created_at)
          VALUES ($1, $2, $3, $4) RETURNING id`,
    params: [mosqueOf(committee.mosque_id), committee.name, committee.description, committee.created_at],
  }));

  await copyTable("committee_members", srcCommitteeMembers, (link) => {
    const memberId = remapMemberId(link.member_kind, link.member_id, maps);
    if (memberId === null) return null;
    return {
      sql: `INSERT INTO committee_members (committee_id, member_kind, member_id, role, created_at)
            VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      params: [maps.committees.get(link.committee_id) ?? null, link.member_kind, memberId, link.role, link.created_at],
    };
  });

  await copyTable("committee_tasks", srcTasks, (task) => ({
    sql: `INSERT INTO committee_tasks (committee_id, title, status, due_date, created_at)
          VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    params: [maps.committees.get(task.committee_id) ?? null, task.title, task.status, task.due_date ?? null, task.created_at],
  }));

  await copyTable("evaluation_criteria", srcCriteria, (criterion) => ({
    sql: `INSERT INTO evaluation_criteria (mosque_id, name, max_score, sort_order, active, created_at)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    params: [mosqueOf(criterion.mosque_id), criterion.name, criterion.max_score, criterion.sort_order,
             criterion.active === true, criterion.created_at],
  }));

  await copyTable("evaluations", srcEvaluations, (evaluation) => {
    const targetId = remapEvaluationTargetId(evaluation.target_kind, evaluation.target_id, maps);
    if (targetId === null) return null;
    return {
      sql: `INSERT INTO evaluations (mosque_id, week_start, target_kind, target_id, criterion_id, score, note, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
      params: [mosqueOf(evaluation.mosque_id), evaluation.week_start, evaluation.target_kind, targetId,
               maps.evaluationCriteria.get(evaluation.criterion_id) ?? null, evaluation.score, evaluation.note,
               evaluation.created_at, evaluation.updated_at],
    };
  });

  await copyTable("activities", srcActivities, (activity) => {
    const tag = remapActivityTag(activity.tag_kind ?? null, activity.tag_id ?? null, maps);
    return {
      sql: `INSERT INTO activities (mosque_id, title, description, activity_date, tag_kind, tag_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      params: [mosqueOf(activity.mosque_id), activity.title, activity.description, activity.activity_date,
               tag.tagKind, tag.tagId, activity.created_at],
    };
  });

  await copyTable("activity_media", srcMedia, (media) => {
    const activityId = maps.activities.get(media.activity_id) ?? null;
    return media.kind === "photo"
      ? {
          sql: `INSERT INTO activity_media (activity_id, mosque_id, kind, mime, bytes, size_bytes, url, sort_order, created_at)
                VALUES ($1, $2, 'photo', $3, decode($4, 'base64'), $5, NULL, $6, $7) RETURNING id`,
          params: [activityId, mosqueOf(media.mosque_id), media.mime ?? null, media.bytes_b64 ?? "", media.size_bytes ?? null,
                   media.sort_order, media.created_at],
        }
      : {
          sql: `INSERT INTO activity_media (activity_id, mosque_id, kind, mime, bytes, size_bytes, url, sort_order, created_at)
                VALUES ($1, $2, 'video_link', NULL, NULL, NULL, $3, $4, $5) RETURNING id`,
          params: [activityId, mosqueOf(media.mosque_id), media.url ?? null, media.sort_order, media.created_at],
        };
  });

  await copyTable("badges", srcBadges, (badge) => ({
    sql: `INSERT INTO badges (mosque_id, name, icon, description, criteria_note, created_at)
          VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    params: [mosqueOf(badge.mosque_id), badge.name, badge.icon, badge.description, badge.criteria_note, badge.created_at],
  }));

  await copyTable("badge_awards", srcAwards, (award) => {
    const targetId = remapBadgeTargetId(award.target_kind, award.target_id, maps);
    if (targetId === null) return null;
    return {
      sql: `INSERT INTO badge_awards (badge_id, mosque_id, target_kind, target_id, awarded_at, note, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      params: [maps.badges.get(award.badge_id) ?? null, mosqueOf(award.mosque_id), award.target_kind, targetId,
               award.awarded_at, award.note, award.created_at],
    };
  });

  await copyTable("schedule_slots", srcSlots, (slot) => ({
    sql: `INSERT INTO schedule_slots (mosque_id, day_of_week, period, start_time, title, program_kind, ref_id, location, notes, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
    params: [mosqueOf(slot.mosque_id), slot.day_of_week, slot.period, slot.start_time ?? null, slot.title, slot.program_kind,
             remapScheduleRef(slot.program_kind, slot.ref_id ?? null, maps), slot.location ?? null, slot.notes ?? null, slot.created_at],
  }));
} catch (error) {
  console.error(error);
  await shutdown();
}

// تسجيل كل صف منقول بـ merge_id_map (داخل المعاملة نفسها) — أساس إعادة
// التشغيل الآمنة والتحقق أدناه. لا شيء يُكتب بالـ dry-run.
for (const entry of newEntries) {
  await exec(
    "INSERT INTO merge_id_map (source_table, source_id, target_id) VALUES ($1, $2, $3) ON CONFLICT (source_table, source_id) DO NOTHING",
    [entry.table, entry.sourceId, entry.targetId],
  );
}

// ————— التقرير —————

console.log(dryRun ? "خطة النقل (dry-run — لم يُكتب شيء)" : "النسخ تم داخل المعاملة — بقية التحقق:");
for (const [table, s] of Object.entries(stats)) {
  const target = TARGET_OF[table] ?? table;
  const extra = s.unassigned ? `، سيصبح غير موزَّع: ${s.unassigned}` : "";
  console.log(
    `${table}${target !== table ? ` → ${target}` : ""}: المصدر ${s.source}، للنقل ${s.copyNow}، منقول سابقاً ${s.already}` +
      `${s.skippedLinks ? `، بلا نظير/مُسكب: ${s.skippedLinks}` : ""}${extra}`,
  );
}

if (unmatchedHalaqahs.length > 0) {
  console.log(`\nحلقات بلا نظير بالهدف (${unmatchedHalaqahs.length}):`);
  for (const item of unmatchedHalaqahs) {
    console.log(`  [${item.reason}] ${item.mosque} — «${item.name}» (${item.code ?? "بلا رمز"})`);
  }
}

console.log(`\nخريطة المعرّفات (المصدر → الهدف)${dryRun ? " — مدخلات هذه الجولة (*) تظهر بمعرّف مصدرها مؤقتاً حتى --apply" : ":"}`);
for (const [table, map] of Object.entries(book)) {
  if (map.size === 0) continue;
  const entries = [...map.entries()]
    .map(([s, t]) => `${s}→${t}${newKeys.has(`${table}:${s}`) ? "*" : ""}`)
    .join("، ");
  console.log(`  ${TARGET_OF[table]}: ${entries}`);
}

// ————— التحقق والإنهاء —————

if (dryRun) {
  console.log("\n--dry-run: لم نكتب شيئاً في القاعدة. أعد التشغيل بـ --apply للتنفيذ.");
  await finish(0);
}

const failures = [];
for (const [table, targetTable] of Object.entries(TARGET_OF)) {
  const expected = book[table].size;
  const counted = await client.query(
    `SELECT count(*)::int AS n FROM ${targetTable} t JOIN merge_id_map m ON m.source_table = $1 AND t.id = m.target_id`,
    [table],
  );
  const actual = Number(counted.rows[0].n);
  if (actual !== expected) failures.push(`${table}: بالخريطة ${expected} وبالجدول ${actual}`);
  const accounted = expected + (stats[table]?.skippedLinks ?? 0);
  if (accounted !== (stats[table]?.source ?? 0)) {
    failures.push(`${table}: المصدر ${stats[table]?.source ?? 0} مقابل ${accounted} (خريطة + مُسكب)`);
  }
}

const mappedMosqueIds = [...maps.mosques.values()];
if (mappedMosqueIds.length > 0) {
  const counted = await client.query(
    "SELECT count(*)::int AS n FROM mosque_features WHERE mosque_id = ANY($1::int[])",
    [mappedMosqueIds],
  );
  if (Number(counted.rows[0].n) !== srcFeatures.length) {
    failures.push(`mosque_features: المصدر ${srcFeatures.length} وبالهدف ${Number(counted.rows[0].n)}`);
  }
}

if (failures.length > 0) {
  await client.query("ROLLBACK");
  console.error("\nفشل التحقق — رُوجعت المعاملة كاملة (ROLLBACK):");
  for (const failure of failures) console.error(`  - ${failure}`);
  await finish(1);
}

await client.query("COMMIT");
console.log("\nتم التحقق من كل الأعداد — COMMIT. النقل مكتمل ✓");
await finish(0);
