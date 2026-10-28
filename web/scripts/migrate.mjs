/*
  مشغّل المايقريشنز اليدوي (FR-002 — نقل القاعدة عن Netlify): المايقريشنز
  كانت لا تُطبَّق إلا بنشر Netlify؛ هذا المشغّل يطبّقها على أي قاعدة
  Postgres بنشر بلا Netlify إطلاقاً.

  node --experimental-strip-types scripts/migrate.mjs [--status | --baseline --to <name> [--force] | --apply]

  --status  (الافتراضي): عرض المطبّق والمعلّق فقط — لا يغيّر شيئاً.
  --baseline --to <name>: تسجيل كل مايقريشن اسمه يرتّب ≤ <name> «مطبّقاً» دون
             تشغيل أي منها — للنسخة المنقولة بpg_dump التي فيها ما طُبِّق على
             المصدر (Netlify) فقط، فما بعد <name> (مثل M1) لم يكن على المصدر
             ويبقى معلّقاً يُطبَّق لاحقاً ب--apply. يرفض إن كان schema_migrations
             غير فارغ إلا مع --force، ويطبع الحالة بعد التسجيل.
  --apply  : تطبيق المعلّق بالترتيب المعجمي، كل ملف في معاملة واحدة
             (BEGIN … COMMIT مع تسجيله في schema_migrations)، ويتوقف
             عند أول فشل بعد التراجع عنه.

  سلسلة الاتصال من البيئة فقط: DATABASE_URL (القاعدة المستقلة) ثم
  NETLIFY_DB_URL احتياطاً — كما في lib/db.ts. لا تُطبع قيمة أي منهما
  أبداً (يُطبع اسم المتغير المُستخدَم فقط). المنطق النقي (الترتيب، حساب
  المعلّق، رفض المكرر) من ../lib/migrations.ts ويُختبر في migrations.test.ts.
*/
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import { baselineSet, migrationDirNames, pendingMigrations, sortMigrationNames } from "../lib/migrations.ts";

const MIGRATIONS_DIR = fileURLToPath(new URL("../netlify/database/migrations", import.meta.url));

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const modes = ["--status", "--baseline", "--apply"].filter(flag);
if (modes.length > 1) {
  console.error("اختر وضعاً واحداً فقط: --status أو --baseline أو --apply");
  process.exit(2);
}
const mode = modes[0] ?? "--status";
const force = flag("--force");

const toIndex = args.indexOf("--to");
const toName = toIndex === -1 ? undefined : args[toIndex + 1];
if (mode === "--baseline" && !toName) {
  console.error(
    "--baseline يتطلب --to <اسم-مايقريشن>: يُسجّل مطبّقاً كل مايقريشن اسمه يرتّب ≤ الاسم " +
      "المعطى فقط — القاعدة المنقولة فيها ما طُبِّق على المصدر لا المجلد كاملاً. " +
      "مثال: --baseline --to 20261114000000_integrations",
  );
  process.exit(2);
}

function log(line = "") {
  console.log(line);
}

async function connect() {
  const envName = process.env.DATABASE_URL ? "DATABASE_URL" : "NETLIFY_DB_URL";
  const connectionString = process.env.DATABASE_URL ?? process.env.NETLIFY_DB_URL;
  if (!connectionString) {
    console.error("لا سلسلة اتصال: اضبط DATABASE_URL (أو NETLIFY_DB_URL احتياطاً) في البيئة. القيم لا تُطبع هنا.");
    process.exit(1);
  }
  log(`المصدر: ${envName} (القيمة لا تُطبع)`);
  const client = new pg.Client({ connectionString });
  await client.connect();
  return client;
}

/** قراءة مجلد المايقريشنز → أسماء مرتّبة (يرمي عند تكرار اسم عبر sortMigrationNames) */
async function orderedMigrationNames() {
  const dirEntries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const entries = [];
  for (const e of dirEntries) {
    if (!e.isDirectory()) {
      entries.push({ name: e.name, isDirectory: false, hasMigrationSql: false });
      continue;
    }
    const hasSql = await stat(path.join(MIGRATIONS_DIR, e.name, "migration.sql")).then(
      () => true,
      () => false,
    );
    entries.push({ name: e.name, isDirectory: true, hasMigrationSql: hasSql });
  }
  return sortMigrationNames(migrationDirNames(entries));
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name      TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

async function appliedNames(client) {
  const rows = await client.query(`SELECT name FROM schema_migrations`);
  return rows.rows.map((r) => r.name);
}

/** طباعة الحالة: عدد المطبّق + قائمة المعلّق + تنبيه على أسماء مطبّقة لا وجود لها في المجلد */
function printStatus(ordered, applied) {
  const pending = pendingMigrations(ordered, applied);
  const strays = applied.filter((n) => !ordered.includes(n));
  log(`  مجلد المايقريشنز: ${ordered.length}، المطبّق: ${applied.length}، المعلّق: ${pending.length}`);
  if (pending.length) {
    log("");
    log("المعلّق (بترتيب التطبيق):");
    for (const name of pending) log(`  ${name}`);
  } else {
    log("لا شيء معلّق — المخطط على آخر نسخة.");
  }
  if (strays.length) {
    log("");
    log("تنبيه: أسماء مسجّلة مطبّقة لا وجود لها في مجلد المايقريشنز (تُتجاهل بلا خطأ):");
    for (const name of strays) log(`  ${name}`);
  }
}

/** عرض المطبّق والمعلّق */
async function status() {
  const ordered = await orderedMigrationNames();
  const client = await connect();
  try {
    await ensureTable(client);
    log(`== الحالة ==`);
    printStatus(ordered, await appliedNames(client));
  } finally {
    await client.end();
  }
}

/**
 * تسجيل ما طُبِّق على المصدر مطبّقاً دون تشغيل: كل اسم يرتّب ≤ to (شاملاً to)
 * — للنسخة المنقولة بpg_dump. ما بعد to لم يكن على المصدر فيبقى معلّقاً.
 */
async function baseline() {
  const ordered = await orderedMigrationNames();
  let toRecord;
  try {
    toRecord = baselineSet(ordered, toName);
  } catch (err) {
    console.error(`${err.message} — حدّد --to باسم مجلد موجود (وترتيبه هو حدّ التسجيل).`);
    process.exit(2);
  }
  const client = await connect();
  try {
    await ensureTable(client);
    const applied = new Set(await appliedNames(client));
    if (applied.size > 0 && !force) {
      console.error(
        `schema_migrations غير فارغ (${applied.size} اسماً) — baseline لنسخة قائمة قد يُسجّل ما لم يُطبَّق فعلاً. ` +
          "استعمل --force إن كنت متأكداً (يسجّل الناقص فقط).",
      );
      process.exitCode = 1;
      return;
    }
    await client.query("BEGIN");
    let added = 0;
    for (const name of toRecord) {
      const r = await client.query(
        `INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
        [name],
      );
      added += r.rowCount;
    }
    await client.query("COMMIT");
    log(`== baseline حتى ${toName} (شاملاً) ==`);
    log(`  سُجّل مطبّقاً: ${added}، كان مسجّلاً سابقاً: ${toRecord.length - added} (دون تشغيل أي ملف).`);
    log("");
    log(`== الحالة بعد baseline ==`);
    printStatus(ordered, await appliedNames(client));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`فشل baseline، تم التراجع: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

/** تطبيق المعلّق بالترتيب — كل ملف في معاملة، توقف عند أول فشل */
async function apply() {
  const ordered = await orderedMigrationNames();
  const client = await connect();
  try {
    await ensureTable(client);
    const pending = pendingMigrations(ordered, await appliedNames(client));
    if (pending.length === 0) {
      log("لا شيء معلّق — لا شيء للتطبيق.");
      return;
    }
    log(`سيُطبَّق ${pending.length} مايقريشن بالترتيب:`);
    for (const name of pending) log(`  ${name}`);
    // قراءة كل الملفات قبل لمس القاعدة — ملف مفقود يُوقف كل شيء مبكراً
    const files = new Map();
    for (const name of pending) {
      files.set(name, await readFile(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"));
    }
    for (const name of pending) {
      try {
        await client.query("BEGIN");
        await client.query(files.get(name));
        await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [name]);
        await client.query("COMMIT");
        log(`تم: ${name}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("");
        console.error(`فشل ${name} — رُوجع بالكامل (ROLLBACK)، ولا شيء طُبِّق منه.`);
        console.error(`السبب: ${err.message}`);
        console.error("توقف المشغّل عند أول فشل؛ ما بعده لم يُمسّ. المطبّق قبلَه بقي محفوظاً.");
        process.exitCode = 1;
        return;
      }
    }
    log(`== اكتمل التطبيق: ${pending.length} مايقريشن ==`);
  } finally {
    await client.end();
  }
}

if (mode === "--baseline") await baseline();
else if (mode === "--apply") await apply();
else await status();
