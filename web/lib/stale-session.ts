/*
  كوكيات جلسة قديمة/غير صالحة: proxy.ts يرى مجرّد وجود كوكي جلسة فلا يعيد
  كتابة "/" إلى /welcome، فتظهر شاشة دخول المعلّم عند الجذر ويدور الزائر
  حولها. هذا المنطق النقي يفحص كل دور له كوكي: الصالح يبقى ويُرجِع صفحته
  الرئيسية، وغير الصالح (فحص رجع null) يُمسح. فشل الفحص نفسه (استثناء) لا
  يمسح شيئاً — خلل مؤقت بالقاعدة لا يُخرج أحداً.
*/

export type RoleSessionCheck = {
  /** اسم الدور لتقرير النتيجة فقط */
  role: string;
  hasCookie: () => boolean | Promise<boolean>;
  /** صفحة الدور الرئيسية إن كانت الجلسة صالحة، وإلا null */
  validHome: () => Promise<string | null>;
  clear: () => Promise<void>;
};

export type StaleSessionResult = {
  /** الأدوار التي مُسحت كوكياتها */
  cleared: string[];
  /** الصفحة الرئيسية لأول دور بجلسة صالحة، أو null */
  home: string | null;
};

export async function clearStaleSessions(checks: RoleSessionCheck[]): Promise<StaleSessionResult> {
  const cleared: string[] = [];
  let home: string | null = null;
  for (const check of checks) {
    if (!(await check.hasCookie())) continue;
    let validHome: string | null;
    try {
      validHome = await check.validHome();
    } catch {
      continue;
    }
    if (validHome === null) {
      await check.clear();
      cleared.push(check.role);
    } else if (home === null) {
      home = validHome;
    }
  }
  return { cleared, home };
}
