/*
  التحقّق من اكتمال النسخ (FR-004 / SC-001): مقارنة عدد الصفوف لكل جدول
  بين قاعدة المصدر وقاعدة الهدف بعد pg_dump/pg_restore. يطبع جدولاً
  بأسماء الجداول وعدد الصفوف في كلٍّ والفرق، ويخرج برمز 1 عند أي فرق
  (اختلاف عدد، أو جدول موجود في قاعدة واحدة فقط) — 0 عند التطابق الكامل.

  SOURCE_DB_URL="<...>" TARGET_DB_URL="<...>" node scripts/verify-copy.mjs

  السلسلتان من البيئة فقط ولا تُطبع قيمتهما أبداً. شغّله قبل migrate
  --baseline: بعده يظهر جدول schema_migrations في الهدف وحده فيفسد
  المقارنة. يشمل العدّ جداول public الأساسية كلها.
*/
import pg from "pg";

function log(line = "") {
  console.log(line);
}

async function connect(envName) {
  const connectionString = process.env[envName];
  if (!connectionString) {
    console.error(`${envName} غير معرّف في البيئة (القيمة لا تُطبع).`);
    process.exit(1);
  }
  const client = new pg.Client({ connectionString });
  await client.connect();
  return client;
}

/** عدد صفوف كل جدول أساسي في مخطط public — Map(اسم الجدول → العدد) */
async function tableCounts(client) {
  const tables = await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`,
  );
  const counts = new Map();
  for (const r of tables.rows) {
    const c = await client.query(`SELECT count(*)::int AS n FROM "${r.table_name}"`);
    counts.set(r.table_name, c.rows[0].n);
  }
  return counts;
}

const source = await connect("SOURCE_DB_URL");
const target = await connect("TARGET_DB_URL");
let mismatches = 0;
try {
  const [srcCounts, tgtCounts] = [await tableCounts(source), await tableCounts(target)];
  const names = [...new Set([...srcCounts.keys(), ...tgtCounts.keys()])].sort();

  log("== مقارنة عدد الصفوف لكل جدول (المصدر → الهدف) ==");
  log("");
  log(`${"الجدول".padEnd(34)} ${"المصدر".padStart(10)} ${"الهدف".padStart(10)}   الفرق`);
  for (const name of names) {
    const s = srcCounts.has(name) ? srcCounts.get(name) : null;
    const t = tgtCounts.has(name) ? tgtCounts.get(name) : null;
    let verdict;
    if (s === null) verdict = "مفقود في المصدر";
    else if (t === null) verdict = "مفقود في الهدف";
    else if (s === t) verdict = "متطابق";
    else verdict = `فرق ${t - s > 0 ? "+" : ""}${t - s}`;
    if (verdict !== "متطابق") mismatches++;
    log(
      `${name.padEnd(34)} ${s === null ? "—".padStart(10) : String(s).padStart(10)} ${
        t === null ? "—".padStart(10) : String(t).padStart(10)
      }   ${verdict}`,
    );
  }

  log("");
  if (mismatches > 0) {
    log(`فشل التحقّق: ${mismatches} جدولاً مختلفاً — لا تكمل التحويل قبل مطابقتهما.`);
    process.exitCode = 1;
  } else {
    log(`تطابق تام: ${names.length} جدولاً بنفس عدد الصفوف في القاعدتين.`);
  }
} finally {
  await source.end();
  await target.end();
}
