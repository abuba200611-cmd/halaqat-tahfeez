/*
  بذر بيانات عرض تجريبية: عدة جوامع بحلقاتها وطلابها وتاريخ ٣٠ يوماً.

  node -r dotenv/config scripts/seed-demo.mjs dotenv_config_path=.env.local [--dry-run | --apply | --remove]

  --dry-run (الافتراضي): قراءة فقط. يطبع ما سيُنشأ ويفحص المتطلبات. لا يغيّر شيئاً.
  --apply   : ينشئ كل شيء بمعاملة واحدة، ويسجّل كل صف في demo_seed_rows. آمن للتكرار.
  --rollback: مع --apply أو --remove يُنفّذ كل شيء ثم يتراجع (بروفة؛ يستهلك معرّفات تسلسلية فقط).
  --remove  : يحذف ما سُجّل فقط بمعاملة واحدة، ويُجهض (ROLLBACK) لو كان سيمسّ أي شيء غير موسوم.
              --include-descendants يسمح بحذف صفوف أنشأها المستخدم تحت حاويات تجريبية
              (جامع/حلقة تجريبية فقط؛ لا يمسّ أبداً حلقة المعلّم 70 ولا أي جامع غير تجريبي).

  لا حسابات قابلة للدخول: المعلّمون كلمة مرورهم "!" (ليست بصيغة salt:hash فلا يتحقق منها verifyPassword)،
  والطلاب بلا username/password_hash. لا يُطبع أي سر ولا رابط اتصال.
*/
import pg from "pg";
import {
  DEMO_PREFIX, EXISTING_TEACHER_ID, buildPlan, summarizePlan, todayIso,
} from "./seed-demo-lib.mjs";

const MARKER_TABLE = "__seed__";
const DISABLED_HASH = "!";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const modes = ["--dry-run", "--apply", "--remove"].filter(flag);
if (modes.length > 1) {
  console.error("اختر وضعاً واحداً فقط: --dry-run أو --apply أو --remove");
  process.exit(2);
}
const mode = modes[0] ?? "--dry-run";
const includeDescendants = flag("--include-descendants");
const rehearsal = flag("--rollback");
const todayArg = args.find((a) => a.startsWith("--today="))?.slice(8);

function log(line = "") {
  console.log(line);
}

// ————— اتصال وأدوات —————

async function connect() {
  const connectionString = process.env.NETLIFY_DB_URL;
  if (!connectionString) {
    console.error("NETLIFY_DB_URL غير معرّف (حمّل web/.env.local عبر dotenv_config_path).");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  return client;
}

async function introspect(c) {
  const t = await c.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
  );
  const tables = new Set(t.rows.map((r) => r.table_name));
  const col = await c.query(`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`);
  const columns = new Map();
  for (const r of col.rows) {
    if (!columns.has(r.table_name)) columns.set(r.table_name, new Set());
    columns.get(r.table_name).add(r.column_name);
  }
  return { tables, columns };
}

/** الأقسام ومتطلبات جداولها — الناقص يُتخطى ويُبلَّغ عنه */
const SECTIONS = {
  association: ["associations"],
  mosque_features: ["mosque_features"],
  teachers: ["teachers"],
  students: ["students"],
  profiles: ["student_profiles"],
  attendance: ["attendance"],
  wards: ["ward_logs"],
  segments: ["ward_review_segments"],
  exams: ["exam_types", "exam_sessions", "exam_session_members", "exam_nominations", "exam_results"],
  fees: ["fee_plans", "student_fees", "fee_payments"],
  visits: ["supervisor_visits", "visit_criteria_scores"],
  registrations: ["mosque_registrations"],
};
const REQUIRED_CORE = ["mosques", "halaqahs", "teachers", "students"];

function availability(schema) {
  const enabled = {};
  const skipped = [];
  for (const [section, needs] of Object.entries(SECTIONS)) {
    const missing = needs.filter((n) => !schema.tables.has(n));
    enabled[section] = missing.length === 0;
    if (missing.length) skipped.push(`${section} (ينقص: ${missing.join(", ")})`);
  }
  // الأقسام التي تعتمد على الطلاب/الحلقات/المعلّمين
  for (const dependent of ["profiles", "attendance", "wards", "segments", "exams", "fees"]) {
    if (!enabled.students && enabled[dependent]) {
      enabled[dependent] = false;
      skipped.push(`${dependent} (يتطلب students)`);
    }
  }
  if (!enabled.wards && enabled.segments) {
    enabled.segments = false;
    skipped.push("segments (يتطلب ward_logs)");
  }
  return { enabled, skipped };
}

function hasCol(schema, table, column) {
  return schema.columns.get(table)?.has(column) ?? false;
}

/** إدراج متعدد الصفوف على دفعات؛ يعيد الصفوف المرجَعة عند طلب returning */
async function insertMany(c, table, columns, rows, returning) {
  const out = [];
  if (rows.length === 0) return out;
  const perChunk = Math.max(1, Math.floor(30000 / columns.length));
  for (let i = 0; i < rows.length; i += perChunk) {
    const chunk = rows.slice(i, i + perChunk);
    const params = [];
    const tuples = chunk.map((row) => {
      const ph = row.map((v) => {
        params.push(v);
        return `$${params.length}`;
      });
      return `(${ph.join(", ")})`;
    });
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${tuples.join(", ")}${returning ? ` RETURNING ${returning}` : ""}`;
    const res = await c.query(sql, params);
    if (returning) out.push(...res.rows);
  }
  return out;
}

const created = new Map();
async function track(c, table, keys) {
  if (keys.length === 0) return;
  created.set(table, (created.get(table) ?? 0) + keys.length);
  for (let i = 0; i < keys.length; i += 2000) {
    await c.query(
      `INSERT INTO demo_seed_rows (table_name, row_key) SELECT $1, k FROM jsonb_array_elements($2::jsonb) AS k`,
      [table, JSON.stringify(keys.slice(i, i + 2000))],
    );
  }
}

async function ensureTrackingTable(c) {
  await c.query(`
    CREATE TABLE IF NOT EXISTS demo_seed_rows (
      table_name text        NOT NULL,
      row_key    jsonb       NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (table_name, row_key)
    )`);
}

// ————— dry-run —————

async function dryRun() {
  const c = await connect();
  try {
    await c.query("BEGIN READ ONLY");
    const schema = await introspect(c);
    const today = todayArg ?? todayIso();
    const plan = buildPlan({ today });
    const summary = summarizePlan(plan);
    const { skipped } = availability(schema);

    log(`== وضع التجربة (قراءة فقط) — التاريخ المرجعي ${today} ==`);
    log("");
    log("-- المتطلبات --");
    for (const t of REQUIRED_CORE) log(`  ${schema.tables.has(t) ? "OK     " : "ناقص  "} جدول ${t}`);
    const coreOk = REQUIRED_CORE.every((t) => schema.tables.has(t));
    for (const [table, column] of [["halaqahs", "mosque_id"], ["halaqahs", "capacity"], ["mosques", "association_id"], ["ward_review_segments", "track"], ["ward_logs", "error_counts"], ["attendance", "checkin_source"]]) {
      if (schema.tables.has(table)) log(`  ${hasCol(schema, table, column) ? "OK     " : "ناقص  "} عمود ${table}.${column}`);
    }
    log(`  جدول التتبّع demo_seed_rows: ${schema.tables.has("demo_seed_rows") ? "موجود" : "سيُنشأ عند --apply (CREATE TABLE IF NOT EXISTS)"}`);
    if (skipped.length) {
      log("  أقسام ستُتخطّى لغياب جداولها:");
      for (const s of skipped) log(`    SKIP ${s}`);
    } else {
      log("  كل جداول الأقسام موجودة، لا شيء يُتخطّى.");
    }

    if (schema.tables.has("demo_seed_rows")) {
      const marker = await c.query(`SELECT 1 FROM demo_seed_rows WHERE table_name = $1`, [MARKER_TABLE]);
      const tracked = await c.query(`SELECT table_name, count(*)::int AS n FROM demo_seed_rows WHERE table_name <> $1 GROUP BY 1 ORDER BY 1`, [MARKER_TABLE]);
      log(`  حالة البذر الحالية: ${marker.rowCount ? "مُطبَّق سابقاً (--apply ثانية لن تغيّر شيئاً)" : "غير مُطبَّق"}`);
      if (tracked.rowCount) log(`  صفوف مسجّلة: ${tracked.rows.map((r) => `${r.table_name}=${r.n}`).join(", ")}`);
    }

    // تصادم أسماء
    if (coreOk) {
      const names = plan.mosques.map((m) => m.name).concat([plan.association.name]);
      const clashM = await c.query("SELECT name FROM mosques WHERE name = ANY($1)", [names]);
      const clashA = schema.tables.has("associations")
        ? await c.query("SELECT name FROM associations WHERE name = ANY($1)", [names])
        : { rowCount: 0, rows: [] };
      const clash = { rowCount: clashM.rowCount + clashA.rowCount, rows: [...clashM.rows.map(() => ({ t: "mosques" })), ...clashA.rows.map(() => ({ t: "associations" }))] };
      const marked = schema.tables.has("demo_seed_rows")
        ? (await c.query(`SELECT 1 FROM demo_seed_rows WHERE table_name = $1`, [MARKER_TABLE])).rowCount > 0
        : false;
      log(`  تصادم أسماء مع صفوف غير مسجّلة: ${clash.rowCount && !marked ? `نعم (${clash.rows.map((r) => r.t).join(", ")}) — --apply سيرفض` : "لا"}`);
      const tClash = await c.query(`SELECT count(*)::int AS n FROM teachers WHERE username LIKE 'demo-teacher-%@example.invalid'`);
      log(`  معلّمون تجريبيون موجودون: ${tClash.rows[0].n}`);
    }

    // المعلّم 70
    log("");
    log(`-- المعلّم ${EXISTING_TEACHER_ID} --`);
    if (coreOk) {
      const t = await c.query(`SELECT t.id, t.halaqah_id, t.role, h.name AS halaqah_name, h.mosque_id FROM teachers t LEFT JOIN halaqahs h ON h.id = t.halaqah_id WHERE t.id = $1`, [EXISTING_TEACHER_ID]);
      if (!t.rowCount) {
        log("  غير موجود: لن يُربط أحد، وستُنشأ حلقة تجريبية عادية لجامع النور بدلاً منها.");
      } else {
        const row = t.rows[0];
        const others = await c.query(`SELECT count(*)::int AS n FROM teachers WHERE halaqah_id = $1 AND id <> $2`, [row.halaqah_id, EXISTING_TEACHER_ID]);
        const studs = await c.query(`SELECT count(*)::int AS n FROM students WHERE teacher_id = $1`, [row.halaqah_id]);
        log(`  حلقته القائمة: id=${row.halaqah_id} اسمها «${row.halaqah_name}»، mosque_id الحالي=${row.mosque_id ?? "NULL"}، طلابها=${studs.rows[0].n}، معلّمون آخرون فيها=${others.rows[0].n}`);
        log("  القرار: teachers.halaqah_id إلزامي ومعلّم واحد = حلقة واحدة، فلا يمكن حلقة ثانية له.");
        if (row.mosque_id === null) {
          log(`  سيُربط mosque_id لحلقته القائمة بـ«${plan.mosques[0].name}» فقط (لا إنشاء حلقة جديدة له، ولا تعديل اسمها)، ويُسجَّل mosque_id السابق (NULL) للاستعادة عند --remove.`);
        } else {
          log("  حلقته مرتبطة بجامع آخر مسبقاً: لن تُلمس، وستُنشأ حلقة تجريبية عادية بدلاً منها.");
        }
      }
    }

    log("");
    log("-- ما سيُنشأ (أعداد) --");
    for (const [k, v] of Object.entries(summary.counts)) log(`  ${k.padEnd(24)} ${v}`);
    log(`  توزيع حالات الأوراد: ${JSON.stringify(summary.wardsByStatus)}`);
    log(`  توزيع الحضور: ${JSON.stringify(summary.attByStatus)}`);
    const presentish = (summary.attByStatus.present ?? 0) + (summary.attByStatus.late ?? 0);
    log(`  نسبة الحاضرين (حاضر + متأخر): ${((presentish / plan.attendance.length) * 100).toFixed(1)}%`);

    log("");
    log("-- الأسماء --");
    log(`  الجمعية: ${plan.association.name}`);
    for (const m of plan.mosques) {
      log(`  ${m.name}${m.linkedToAssociation ? "  [مرتبط بالجمعية]" : ""}`);
      log(`    مزايا مفعّلة: ${m.featuresOn.join(", ")}`);
      log(`    مزايا مطفأة: ${m.featuresOff.join(", ")}`);
      for (const h of plan.halaqat.filter((x) => x.mosque === m.key)) {
        const n = plan.students.filter((s) => s.halaqah === h.key).length;
        const tn = plan.teachers.find((t) => t.halaqah === h.key);
        log(`    - ${h.name ?? "(حلقة المعلّم 70 القائمة)"} | سعة=${h.capacity ?? "—"} | طلاب=${n} | معلّم=${tn ? tn.name : `id ${h.existingTeacherId}`}`);
      }
    }
    log(`  أمثلة طلاب: ${plan.students.slice(0, 3).map((s) => s.name).join(" | ")} ...`);
    log(`  معلّمون: ${plan.teachers.map((t) => t.name).join(" | ")}`);
    log(`  اختبارات: ${plan.examTypes.map((e) => e.name).join(" | ")}`);
    log(`  رسوم: ${plan.feePlans.map((f) => `${f.name} (${f.amount})`).join(" | ")}`);
    log(`  زيارات: ${plan.visits.map((v) => `${v.status}@${v.mosque}/${v.halaqah} (${v.scheduledFor})`).join(" | ")}`);
    log(`  طلبات تسجيل معلّقة (جامع النور): ${plan.registrations.map((r) => r.name).join(" | ")}`);
    log("");
    log(`ملاحظة: «attendance» ليس مفتاح ميزة في features.ts (الحضور متاح دائماً)؛ التفعيل يشمل qr_attendance.`);
    log(`الخلاصة: ${coreOk ? "جاهز لـ --apply" : "متطلبات أساسية ناقصة — لا يمكن --apply"}. لم يُكتب شيء.`);
    await c.query("ROLLBACK");
  } finally {
    await c.end();
  }
}

// ————— apply —————

async function apply() {
  const c = await connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('halaqat_demo_seed'))`);
    const schema = await introspect(c);
    for (const t of REQUIRED_CORE) if (!schema.tables.has(t)) throw new Error(`جدول أساسي مفقود: ${t}`);
    const { enabled, skipped } = availability(schema);
    for (const s of skipped) log(`SKIP ${s}`);

    await ensureTrackingTable(c);
    const existing = await c.query(`SELECT count(*)::int AS n FROM demo_seed_rows WHERE table_name = $1`, [MARKER_TABLE]);
    if (existing.rows[0].n > 0) {
      log("البذر مُطبَّق سابقاً (علامة __seed__ موجودة): لا تغيير. استعمل --remove ثم --apply لإعادته.");
      await c.query("ROLLBACK");
      return;
    }
    const strays = await c.query(`SELECT count(*)::int AS n FROM demo_seed_rows`);
    if (strays.rows[0].n > 0) throw new Error("demo_seed_rows فيها صفوف بلا علامة اكتمال — حالة غير متوقعة، لا مساس.");

    const today = todayArg ?? todayIso();
    const plan = buildPlan({ today });

    // لا نتبنّى صفوفاً قائمة بنفس الأسماء
    const clashM = await c.query(`SELECT id FROM mosques WHERE name = ANY($1)`, [plan.mosques.map((m) => m.name)]);
    if (clashM.rowCount) throw new Error("يوجد جامع قائم بنفس اسم جامع تجريبي لم يُنشأ بهذا السكربت — رفض.");
    if (enabled.association) {
      const clashA = await c.query(`SELECT id FROM associations WHERE name = $1`, [plan.association.name]);
      if (clashA.rowCount) throw new Error("توجد جمعية قائمة بنفس اسم الجمعية التجريبية — رفض.");
    }
    const clashT = await c.query(`SELECT 1 FROM teachers WHERE username LIKE 'demo-teacher-%@example.invalid'`);
    if (clashT.rowCount) throw new Error("توجد حسابات معلّمين تجريبية سابقة غير مسجّلة — رفض.");

    // — الجمعية والجوامع —
    let associationId = null;
    if (enabled.association) {
      const a = await c.query(`INSERT INTO associations (name) VALUES ($1) RETURNING id`, [plan.association.name]);
      associationId = a.rows[0].id;
      await track(c, "associations", [{ id: associationId }]);
    }
    const mosqueId = {};
    for (const m of plan.mosques) {
      const withAssoc = associationId !== null && m.linkedToAssociation && hasCol(schema, "mosques", "association_id");
      const r = withAssoc
        ? await c.query(`INSERT INTO mosques (name, association_id) VALUES ($1, $2) RETURNING id`, [m.name, associationId])
        : await c.query(`INSERT INTO mosques (name) VALUES ($1) RETURNING id`, [m.name]);
      mosqueId[m.key] = r.rows[0].id;
    }
    await track(c, "mosques", Object.values(mosqueId).map((id) => ({ id })));

    if (enabled.mosque_features) {
      const rows = [];
      for (const m of plan.mosques) {
        for (const k of m.featuresOn) rows.push([mosqueId[m.key], k, true]);
        for (const k of m.featuresOff) rows.push([mosqueId[m.key], k, false]);
      }
      await insertMany(c, "mosque_features", ["mosque_id", "feature_key", "enabled"], rows);
      await track(c, "mosque_features", rows.map((r) => ({ mosque_id: r[0], feature_key: r[1] })));
    }

    // — حلقة المعلّم 70: ربط لا إنشاء —
    let linkedExisting = null;
    const linkPlan = plan.halaqat.find((h) => h.existingTeacherId);
    if (linkPlan) {
      const t = await c.query(
        `SELECT t.halaqah_id, h.mosque_id FROM teachers t JOIN halaqahs h ON h.id = t.halaqah_id WHERE t.id = $1 FOR UPDATE OF h`,
        [linkPlan.existingTeacherId],
      );
      if (t.rowCount && t.rows[0].mosque_id === null) {
        linkedExisting = { halaqahId: t.rows[0].halaqah_id, previousMosqueId: null };
      } else {
        log(t.rowCount ? `تنبيه: حلقة المعلّم ${linkPlan.existingTeacherId} مرتبطة بجامع آخر — لن تُلمس.` : `تنبيه: المعلّم ${linkPlan.existingTeacherId} غير موجود — ستُنشأ حلقة عادية.`);
      }
    }

    const teacherId = {};
    // — الحلقات الجديدة —
    const halaqahId = {};
    const newHalaqat = plan.halaqat.filter((h) => !(h.existingTeacherId && linkedExisting));
    const hCols = ["name", "mosque_id"];
    if (hasCol(schema, "halaqahs", "capacity")) hCols.push("capacity");
    if (hasCol(schema, "halaqahs", "level")) hCols.push("level");
    if (hasCol(schema, "halaqahs", "min_age")) hCols.push("min_age");
    if (hasCol(schema, "halaqahs", "max_age")) hCols.push("max_age");
    const hRows = newHalaqat.map((h) => {
      const base = { name: h.name ?? `${DEMO_PREFIX} حلقة جديدة`, mosque_id: mosqueId[h.mosque], capacity: h.capacity ?? 15, level: h.level, min_age: h.minAge, max_age: h.maxAge };
      return hCols.map((col) => base[col]);
    });
    const inserted = await insertMany(c, "halaqahs", hCols, hRows, "id");
    newHalaqat.forEach((h, i) => (halaqahId[h.key] = inserted[i].id));
    await track(c, "halaqahs", inserted.map((r) => ({ id: r.id })));

    if (linkedExisting) {
      await c.query(`UPDATE halaqahs SET mosque_id = $1 WHERE id = $2 AND mosque_id IS NULL`, [mosqueId.noor, linkedExisting.halaqahId]);
      await track(c, "halaqahs:link", [{ id: linkedExisting.halaqahId, previous_mosque_id: linkedExisting.previousMosqueId, mosque_id: mosqueId.noor }]);
      halaqahId[linkPlan.key] = linkedExisting.halaqahId;
      teacherId[linkPlan.key] = linkPlan.existingTeacherId;
      log(`ربط حلقة المعلّم ${linkPlan.existingTeacherId} (id=${linkedExisting.halaqahId}) بجامع النور؛ mosque_id السابق = NULL (سُجّل للاستعادة).`);
    }

    // — المعلّمون (بلا إمكانية دخول) —
    if (enabled.teachers) {
      const teachersToMake = [...plan.teachers];
      if (linkPlan && !linkedExisting) {
        teachersToMake.push({ halaqah: linkPlan.key, username: "demo-teacher-7@example.invalid", name: `${DEMO_PREFIX} الأستاذ فيصل` });
      }
      const tRows = teachersToMake.filter((t) => halaqahId[t.halaqah]).map((t) => [t.username, DISABLED_HASH, halaqahId[t.halaqah], "supervisor", t.name, false, new Date().toISOString()]);
      const tIns = await insertMany(c, "teachers", ["username", "password_hash", "halaqah_id", "role", "teacher_name", "email_verified", "created_at"], tRows, "id, halaqah_id");
      const byHalaqah = new Map(tIns.map((r) => [r.halaqah_id, r.id]));
      for (const t of teachersToMake) if (halaqahId[t.halaqah]) teacherId[t.halaqah] = byHalaqah.get(halaqahId[t.halaqah]);
      await track(c, "teachers", tIns.map((r) => ({ id: r.id })));
    }

    // — الطلاب (بلا username/password_hash) —
    if (enabled.students) {
      const sRows = plan.students.map((s) => [s.id, halaqahId[s.halaqah], s.name, "", "[]", "{}", true, s.rating, s.index]);
      await insertMany(c, "students", ["id", "teacher_id", "name", "group_name", "ranges", "mastery", "active", "rating", "sort_order"], sRows);
      await track(c, "students", plan.students.map((s) => ({ halaqah_id: halaqahId[s.halaqah], student_id: s.id })));
    }
    if (enabled.profiles) {
      await insertMany(c, "student_profiles", ["halaqah_id", "student_id", "birth_year"], plan.profiles.map((p) => [halaqahId[p.halaqah], p.studentId, p.birthYear]));
      await track(c, "student_profiles", plan.profiles.map((p) => ({ halaqah_id: halaqahId[p.halaqah], student_id: p.studentId })));
    }

    // — الحضور —
    if (enabled.attendance) {
      const withSource = hasCol(schema, "attendance", "checkin_source");
      const cols = ["halaqah_id", "student_id", "date", "status", "recorded_by"].concat(withSource ? ["checkin_source"] : []);
      const rows = plan.attendance.map((a) => {
        const base = [halaqahId[a.halaqah], a.studentId, a.date, a.status, a.checkin ? null : (teacherId[a.halaqah] ?? null)];
        return withSource ? base.concat([a.checkin]) : base;
      });
      await insertMany(c, "attendance", cols, rows);
      await track(c, "attendance", plan.attendance.map((a) => ({ halaqah_id: halaqahId[a.halaqah], student_id: a.studentId, date: a.date })));
    }

    // — الأوراد والمقاطع —
    if (enabled.wards) {
      const hasErr = hasCol(schema, "ward_logs", "error_counts");
      const cols = [
        "teacher_id", "student_id", "date", "hifz_from", "hifz_to", "review_from", "review_to",
        "hifz_from_surah", "hifz_from_ayah", "hifz_to_surah", "hifz_to_ayah",
        "review_from_surah", "review_from_ayah", "review_to_surah", "review_to_ayah",
        "note", "status", "created_at", "reviewed_by", "reviewed_at",
      ].concat(hasErr ? ["error_counts", "error_score", "error_band"] : []);
      const rows = plan.wards.map((w) => {
        const approved = w.status === "approved";
        const reviewer = approved ? (teacherId[w.halaqah] ?? null) : null;
        const base = [
          halaqahId[w.halaqah], w.studentId, w.date, w.hifzFrom, w.hifzTo, w.reviewFrom, w.reviewTo,
          w.hifzAyah?.fromSurah ?? null, w.hifzAyah?.fromAyah ?? null, w.hifzAyah?.toSurah ?? null, w.hifzAyah?.toAyah ?? null,
          w.reviewAyah?.fromSurah ?? null, w.reviewAyah?.fromAyah ?? null, w.reviewAyah?.toSurah ?? null, w.reviewAyah?.toAyah ?? null,
          "", w.status, `${w.date}T15:00:00.000Z`, reviewer, reviewer ? `${w.date}T16:00:00.000Z` : null,
        ];
        return hasErr ? base.concat([w.errorCounts ? JSON.stringify(w.errorCounts) : null, w.errorScore, w.errorBand]) : base;
      });
      const ins = await insertMany(c, "ward_logs", cols, rows, "id, teacher_id, student_id, date");
      await track(c, "ward_logs", ins.map((r) => ({ id: r.id })));
      if (enabled.segments) {
        const idByKey = new Map(ins.map((r) => [`${r.teacher_id}|${r.student_id}|${r.date}`, r.id]));
        const withTrack = hasCol(schema, "ward_review_segments", "track");
        const segCols = ["ward_log_id", "segment_order", "from_surah", "from_ayah", "to_surah", "to_ayah", "from_page", "to_page"].concat(withTrack ? ["track"] : []);
        const segRows = [];
        for (const w of plan.wards) {
          const wardId = idByKey.get(`${halaqahId[w.halaqah]}|${w.studentId}|${w.date}`);
          for (const seg of w.segments) {
            const base = [wardId, seg.order, seg.fromSurah, seg.fromAyah, seg.toSurah, seg.toAyah, seg.fromPage, seg.toPage];
            segRows.push(withTrack ? base.concat([seg.track]) : base);
          }
        }
        const segIns = await insertMany(c, "ward_review_segments", segCols, segRows, "id");
        await track(c, "ward_review_segments", segIns.map((r) => ({ id: r.id })));
      }
    }

    // — الاختبارات —
    if (enabled.exams) {
      const typeId = {};
      const sessionId = {};
      const tIns = await insertMany(c, "exam_types", ["mosque_id", "name", "juz_count", "max_score", "pass_mark", "sort_order"],
        plan.examTypes.map((t, i) => [mosqueId[t.mosque], t.name, t.juzCount, t.maxScore, t.passMark, i]), "id");
      plan.examTypes.forEach((t, i) => (typeId[t.key] = tIns[i].id));
      await track(c, "exam_types", tIns.map((r) => ({ id: r.id })));
      const sIns = await insertMany(c, "exam_sessions", ["mosque_id", "exam_type_id", "session_date", "location", "notes", "status"],
        plan.examSessions.map((s) => [mosqueId[s.mosque], typeId[`${s.mosque}-t1`], s.date, s.location, `${DEMO_PREFIX} جلسة اختبار`, s.status]), "id");
      plan.examSessions.forEach((s, i) => (sessionId[s.key] = sIns[i].id));
      await track(c, "exam_sessions", sIns.map((r) => ({ id: r.id })));

      const teachersOfMosque = (mk) => plan.teachers.filter((t) => plan.halaqat.find((h) => h.key === t.halaqah).mosque === mk && teacherId[t.halaqah]);
      const memberRows = [];
      for (const s of plan.examSessions) for (const t of teachersOfMosque(s.mosque).slice(0, 2)) memberRows.push([sessionId[s.key], "teacher", teacherId[t.halaqah]]);
      const mIns = await insertMany(c, "exam_session_members", ["session_id", "member_kind", "member_id"], memberRows, "id");
      await track(c, "exam_session_members", mIns.map((r) => ({ id: r.id })));

      const nIns = await insertMany(c, "exam_nominations",
        ["mosque_id", "exam_type_id", "halaqah_id", "student_id", "juz_from", "juz_to", "nominated_by", "session_id", "status", "note"],
        plan.nominations.map((n) => [mosqueId[n.mosque], typeId[n.typeKey], halaqahId[n.halaqah], n.studentId, n.juzFrom, n.juzTo, teacherId[n.halaqah], sessionId[n.sessionKey], n.status, ""]),
        "id, halaqah_id, student_id, exam_type_id");
      await track(c, "exam_nominations", nIns.map((r) => ({ id: r.id })));
      const nomByKey = new Map(nIns.map((r) => [`${r.halaqah_id}|${r.student_id}|${r.exam_type_id}`, r.id]));
      const rRows = plan.results.map((r) => {
        const examiner = teachersOfMosque(r.mosque)[0];
        return [
          mosqueId[r.mosque], nomByKey.get(`${halaqahId[r.halaqah]}|${r.studentId}|${typeId[r.typeKey]}`), sessionId[r.sessionKey],
          halaqahId[r.halaqah], r.studentId, r.juzFrom, r.juzTo, r.maxScore, r.passMark, JSON.stringify(r.errors), r.score, r.passed,
          teacherId[examiner.halaqah], "", `${plan.examSessions.find((s) => s.key === r.sessionKey).date}T12:00:00.000Z`,
        ];
      });
      const resIns = await insertMany(c, "exam_results",
        ["mosque_id", "nomination_id", "session_id", "halaqah_id", "student_id", "juz_from", "juz_to", "max_score", "pass_mark", "errors", "score", "passed", "examiner_id", "notes", "published_at"],
        rRows, "id");
      await track(c, "exam_results", resIns.map((r) => ({ id: r.id })));
    }

    // — الرسوم —
    if (enabled.fees) {
      const planId = {};
      const pIns = await insertMany(c, "fee_plans", ["mosque_id", "name", "amount", "period"],
        plan.feePlans.map((p) => [mosqueId[p.mosque], p.name, p.amount, "monthly"]), "id");
      plan.feePlans.forEach((p, i) => (planId[p.key] = pIns[i].id));
      await track(c, "fee_plans", pIns.map((r) => ({ id: r.id })));
      const fIns = await insertMany(c, "student_fees",
        ["mosque_id", "halaqah_id", "student_id", "plan_id", "period_label", "amount_due", "amount_paid", "status", "due_date"],
        plan.fees.map((f) => [mosqueId[f.mosque], halaqahId[f.halaqah], f.studentId, planId[f.planKey], f.periodLabel, f.amountDue, f.amountPaid, f.status, f.dueDate]),
        "id, halaqah_id, student_id, plan_id");
      await track(c, "student_fees", fIns.map((r) => ({ id: r.id })));
      const feeByKey = new Map(fIns.map((r) => [`${r.halaqah_id}|${r.student_id}|${r.plan_id}`, r.id]));
      const payIns = await insertMany(c, "fee_payments", ["student_fee_id", "amount", "paid_at", "method", "receipt_no", "note"],
        plan.payments.map((p) => [feeByKey.get(`${halaqahId[p.halaqah]}|${p.studentId}|${planId[p.planKey]}`), p.amount, p.paidAt, p.method, p.receiptNo, "دفعة تجريبية"]), "id");
      await track(c, "fee_payments", payIns.map((r) => ({ id: r.id })));
    }

    // — الزيارات —
    if (enabled.visits) {
      for (const v of plan.visits) {
        const r = await c.query(
          `INSERT INTO supervisor_visits (association_id, mosque_id, halaqah_id, visitor_kind, visitor_id, visitor_name, scheduled_for, visited_at, status, overall_score, notes, recommendations)
           VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [v.association ? associationId : null, mosqueId[v.mosque], halaqahId[v.halaqah], v.visitorKind, v.visitorName, v.scheduledFor, v.visitedAt, v.status, v.overallScore, v.notes, v.recommendations],
        );
        const visitId = r.rows[0].id;
        await track(c, "supervisor_visits", [{ id: visitId }]);
        if (v.scores.length) {
          await insertMany(c, "visit_criteria_scores", ["visit_id", "criterion_key", "score", "note"], v.scores.map((s) => [visitId, s.key, s.score, s.note]));
          await track(c, "visit_criteria_scores", v.scores.map((s) => ({ visit_id: visitId, criterion_key: s.key })));
        }
      }
    }

    // — طلبات تسجيل معلّقة —
    if (enabled.registrations) {
      const withLevel = hasCol(schema, "mosque_registrations", "level") && hasCol(schema, "mosque_registrations", "birth_year");
      const cols = ["mosque_id", "name", "phone", "status", "created_at"].concat(withLevel ? ["birth_year", "level"] : []);
      const rows = plan.registrations.map((r) => {
        const base = [mosqueId[r.mosque], r.name, "", "pending", r.createdAt];
        return withLevel ? base.concat([r.birthYear, r.level]) : base;
      });
      const ins = await insertMany(c, "mosque_registrations", cols, rows, "id");
      await track(c, "mosque_registrations", ins.map((r) => ({ id: r.id })));
    }

    await track(c, MARKER_TABLE, [{ version: 1, today, seed: plan.seed }]);
    await c.query(rehearsal ? "ROLLBACK" : "COMMIT");

    log(rehearsal ? "== بروفة --apply --rollback: نُفّذ كل شيء ثم تُرك بلا حفظ (المعرّفات التسلسلية تُستهلك) ==" : "== تم --apply (معاملة واحدة) ==");
    for (const [t, n] of [...created.entries()].filter(([t]) => t !== MARKER_TABLE)) log(`  ${t.padEnd(24)} ${n}`);
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(`فشل --apply، تم التراجع عن كل شيء: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}

// ————— remove —————

/** كل جدول → استعلام حذف يربط demo_seed_rows (مفاتيح مركّبة أو id) */
const REMOVE_ORDER = [
  ["fee_payments", `DELETE FROM fee_payments t USING demo_seed_rows d WHERE d.table_name = 'fee_payments' AND (d.row_key->>'id')::int = t.id`],
  ["student_fees", `DELETE FROM student_fees t USING demo_seed_rows d WHERE d.table_name = 'student_fees' AND (d.row_key->>'id')::int = t.id`],
  ["fee_plans", `DELETE FROM fee_plans t USING demo_seed_rows d WHERE d.table_name = 'fee_plans' AND (d.row_key->>'id')::int = t.id`],
  ["exam_results", `DELETE FROM exam_results t USING demo_seed_rows d WHERE d.table_name = 'exam_results' AND (d.row_key->>'id')::int = t.id`],
  ["exam_nominations", `DELETE FROM exam_nominations t USING demo_seed_rows d WHERE d.table_name = 'exam_nominations' AND (d.row_key->>'id')::int = t.id`],
  ["exam_session_members", `DELETE FROM exam_session_members t USING demo_seed_rows d WHERE d.table_name = 'exam_session_members' AND (d.row_key->>'id')::int = t.id`],
  ["exam_sessions", `DELETE FROM exam_sessions t USING demo_seed_rows d WHERE d.table_name = 'exam_sessions' AND (d.row_key->>'id')::int = t.id`],
  ["exam_types", `DELETE FROM exam_types t USING demo_seed_rows d WHERE d.table_name = 'exam_types' AND (d.row_key->>'id')::int = t.id`],
  ["visit_criteria_scores", `DELETE FROM visit_criteria_scores t USING demo_seed_rows d WHERE d.table_name = 'visit_criteria_scores' AND (d.row_key->>'visit_id')::int = t.visit_id AND d.row_key->>'criterion_key' = t.criterion_key`],
  ["supervisor_visits", `DELETE FROM supervisor_visits t USING demo_seed_rows d WHERE d.table_name = 'supervisor_visits' AND (d.row_key->>'id')::int = t.id`],
  ["mosque_registrations", `DELETE FROM mosque_registrations t USING demo_seed_rows d WHERE d.table_name = 'mosque_registrations' AND (d.row_key->>'id')::int = t.id`],
  ["ward_review_segments", `DELETE FROM ward_review_segments t USING demo_seed_rows d WHERE d.table_name = 'ward_review_segments' AND (d.row_key->>'id')::int = t.id`],
  ["ward_logs", `DELETE FROM ward_logs t USING demo_seed_rows d WHERE d.table_name = 'ward_logs' AND (d.row_key->>'id')::int = t.id`],
  ["attendance", `DELETE FROM attendance t USING demo_seed_rows d WHERE d.table_name = 'attendance' AND (d.row_key->>'halaqah_id')::int = t.halaqah_id AND d.row_key->>'student_id' = t.student_id AND d.row_key->>'date' = t.date`],
  ["student_profiles", `DELETE FROM student_profiles t USING demo_seed_rows d WHERE d.table_name = 'student_profiles' AND (d.row_key->>'halaqah_id')::int = t.halaqah_id AND d.row_key->>'student_id' = t.student_id`],
  ["students", `DELETE FROM students t USING demo_seed_rows d WHERE d.table_name = 'students' AND (d.row_key->>'halaqah_id')::int = t.teacher_id AND d.row_key->>'student_id' = t.id`],
  ["teachers", `DELETE FROM teachers t USING demo_seed_rows d WHERE d.table_name = 'teachers' AND (d.row_key->>'id')::int = t.id`],
];

async function remove() {
  const c = await connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT pg_advisory_xact_lock(hashtext('halaqat_demo_seed'))`);
    const schema = await introspect(c);
    if (!schema.tables.has("demo_seed_rows")) {
      log("لا يوجد جدول demo_seed_rows — لا شيء لحذفه.");
      await c.query("ROLLBACK");
      return;
    }
    const tracked = (await c.query(`SELECT table_name, row_key FROM demo_seed_rows`)).rows;
    if (tracked.length === 0) {
      log("لا صفوف مسجّلة — لا شيء لحذفه.");
      await c.query("ROLLBACK");
      return;
    }
    const keysOf = (table) => tracked.filter((r) => r.table_name === table).map((r) => r.row_key);
    const ids = (table) => keysOf(table).map((k) => k.id);

    // ١) التحقق من الوسم قبل أي حذف
    const nameChecks = [
      ["mosques", "name", ids("mosques")],
      ["associations", "name", ids("associations")],
      ["halaqahs", "name", ids("halaqahs")],
      ["teachers", "teacher_name", ids("teachers")],
      ["mosque_registrations", "name", ids("mosque_registrations")],
      ["fee_plans", "name", ids("fee_plans")],
      ["exam_types", "name", ids("exam_types")],
    ];
    for (const [table, col, list] of nameChecks) {
      if (!list.length || !schema.tables.has(table)) continue;
      const r = await c.query(`SELECT id, ${col} AS n FROM ${table} WHERE id = ANY($1::int[])`, [list]);
      const bad = r.rows.filter((row) => !String(row.n).startsWith(DEMO_PREFIX));
      if (bad.length) throw new Error(`${table}: ${bad.length} صف مسجّل لا يحمل وسم ${DEMO_PREFIX} (id: ${bad.map((b) => b.id).join(",")}) — رفض.`);
    }
    const studentKeys = keysOf("students");
    if (studentKeys.length) {
      const r = await c.query(
        `SELECT count(*)::int AS n FROM students s JOIN demo_seed_rows d ON d.table_name='students' AND (d.row_key->>'halaqah_id')::int = s.teacher_id AND d.row_key->>'student_id' = s.id WHERE s.name NOT LIKE $1`,
        [`${DEMO_PREFIX}%`],
      );
      if (r.rows[0].n) throw new Error(`students: ${r.rows[0].n} طالباً مسجّلاً بلا وسم ${DEMO_PREFIX} — رفض.`);
    }
    const mosqueIds = ids("mosques");
    const newHalaqahIds = ids("halaqahs");
    const link = keysOf("halaqahs:link")[0] ?? null;
    if (newHalaqahIds.length) {
      const wrong = await c.query(`SELECT count(*)::int AS n FROM halaqahs WHERE id = ANY($1::int[]) AND NOT (mosque_id = ANY($2::int[]))`, [newHalaqahIds, mosqueIds]);
      if (wrong.rows[0].n) throw new Error("حلقة مسجّلة صارت خارج الجوامع التجريبية — رفض.");
    }

    // ٢) عدّادات كل الجداول قبل الحذف (للكشف عن أي حذف متتالٍ غير موسوم)
    const countAll = async () => {
      const out = new Map();
      for (const t of schema.tables) {
        if (t === "demo_seed_rows") continue;
        out.set(t, (await c.query(`SELECT count(*)::int AS n FROM "${t}"`)).rows[0].n);
      }
      return out;
    };
    const before = await countAll();
    const expected = new Map();
    const bump = (t, n) => expected.set(t, (expected.get(t) ?? 0) + n);

    // ٣) استعادة ربط حلقة المعلّم 70 (لا نكتب فوق قرار لاحق للمستخدم)
    if (link) {
      const r = await c.query(`UPDATE halaqahs SET mosque_id = $1 WHERE id = $2 AND mosque_id = $3`, [link.previous_mosque_id, link.id, link.mosque_id]);
      log(r.rowCount ? `استُعيد mosque_id للحلقة ${link.id} إلى ${link.previous_mosque_id ?? "NULL"}.` : `الحلقة ${link.id} لم تعد مرتبطة بالجامع التجريبي — تُركت كما هي.`);
    }

    // ٤) الحذف بالترتيب (الأبناء أولاً)
    for (const [table, sql] of REMOVE_ORDER) {
      if (!schema.tables.has(table)) continue;
      const r = await c.query(sql);
      bump(table, r.rowCount);
    }
    if (newHalaqahIds.length) bump("halaqahs", (await c.query(`DELETE FROM halaqahs WHERE id = ANY($1::int[])`, [newHalaqahIds])).rowCount);
    if (mosqueIds.length) {
      for (const cfg of ["mosque_features", "mosque_settings"]) {
        if (schema.tables.has(cfg)) bump(cfg, (await c.query(`DELETE FROM ${cfg} WHERE mosque_id = ANY($1::int[])`, [mosqueIds])).rowCount);
      }
      bump("mosques", (await c.query(`DELETE FROM mosques WHERE id = ANY($1::int[])`, [mosqueIds])).rowCount);
    }
    const assocIds = ids("associations");
    if (assocIds.length && schema.tables.has("associations")) bump("associations", (await c.query(`DELETE FROM associations WHERE id = ANY($1::int[])`, [assocIds])).rowCount);

    // ٥) المقارنة: أي جدول تغيّر عدّه بما لا يطابق المتوقّع = حذف متتالٍ غير موسوم
    const after = await countAll();
    const surprises = [];
    for (const [t, b] of before) {
      const delta = b - after.get(t);
      const want = expected.get(t) ?? 0;
      if (delta !== want) surprises.push(`${t}: حُذف ${delta} والمتوقع ${want}`);
    }
    if (surprises.length) {
      if (!includeDescendants) {
        throw new Error(`كان الحذف سيمسّ صفوفاً غير موسومة (${surprises.join(" | ")}). أُجهض. استعمل --include-descendants إن كانت من صنعك تحت حاويات تجريبية.`);
      }
      log(`تنبيه (--include-descendants): حذف متتالٍ إضافي تحت حاويات تجريبية: ${surprises.join(" | ")}`);
    }

    await c.query(`DELETE FROM demo_seed_rows`);
    await c.query(rehearsal ? "ROLLBACK" : "COMMIT");
    log(rehearsal ? "== بروفة --remove --rollback: لم يُحفظ شيء ==" : "== تم --remove (معاملة واحدة) ==");
    for (const [t, n] of expected) if (n) log(`  ${t.padEnd(24)} ${n}`);
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(`فشل --remove، تم التراجع عن كل شيء: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}

if (mode === "--apply") await apply();
else if (mode === "--remove") await remove();
else await dryRun();
