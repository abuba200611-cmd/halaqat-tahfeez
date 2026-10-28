/*
  FR-002 (نقل القاعدة عن Netlify): المنطق النقي لمشغّل المايقريشنز — بلا
  أي استيراد وبلا قراءة قرص أو اتصال (ذلك في scripts/migrate.mjs) — كي
  يُختبر هنا بvitest ويقرأه المشغّل عبر node --experimental-strip-types.
*/

/** مدخل من قراءة مجلد المايقريشنز: الاسم + هل هو مجلد + هل فيه migration.sql */
export type MigrationDirEntry = {
  name: string;
  isDirectory: boolean;
  hasMigrationSql: boolean;
};

/** أسماء المجلدات الصالحة فقط (مجلد فيه migration.sql) — بترتيب الإدخال كما هو */
export function migrationDirNames(entries: MigrationDirEntry[]): string[] {
  return entries.filter((e) => e.isDirectory && e.hasMigrationSql).map((e) => e.name);
}

/**
 * يرتّب أسماء المايقريشنز معجمياً (البادئة الزمنية بالاسم تجعل المعجمي هو
 * ترتيب التطبيق). يرمي عند تكرار اسم: التطبيق التدريجي يعتمد الترتيب،
 * والالتباس هناك خطر لا يُحتمل.
 */
export function sortMigrationNames(names: string[]): string[] {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) throw new Error(`اسم مايقريشن مكرر: ${name}`);
    seen.add(name);
  }
  return [...names].sort();
}

/** المعلّق: الأسماء المرتّبة غير المسجّلة مطبّقة، بترتيب التطبيق نفسه */
export function pendingMigrations(orderedNames: string[], applied: Iterable<string>): string[] {
  const appliedSet = new Set(applied);
  return orderedNames.filter((name) => !appliedSet.has(name));
}

/**
 * أساس النقل: ما يُسجّل مطبّقاً بعد pg_dump — كل اسم يرتّب ≤ to (شاملاً to)
 * وفق ترتيب التطبيق نفسه. القاعدة المنقولة فيها مخطط المصدر لا مخطط المجلد
 * كاملاً، فما بعد to (ما لم يُطبَّق على المصدر) يجب أن يبقى معلّقاً فيُطبَّق
 * لاحقاً. يرمي على to غير الموجود: حدٌّ غامض يسجّل أكثر أو أقل من المقصود.
 */
export function baselineSet(all: string[], to: string): string[] {
  if (!all.includes(to)) throw new Error(`اسم مايقريشن غير موجود: ${to}`);
  return all.filter((name) => name <= to);
}
