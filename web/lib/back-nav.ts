/*
  منطق زر «رجوع» الموحّد (دوال نقية قابلة للاختبار):
  - resolveBack(pathname) يحدّد هل يظهر الزر وإلى أين يعود إن لم يوجد تاريخ داخل التطبيق.
  - pushPath يدير مكدّس المسارات داخل الجلسة (يُحفظ في sessionStorage) ليُعرف هل
    توجد صفحة سابقة داخل التطبيق (فيُستخدم router.back()) أم يُذهب للمسار الاحتياطي.
*/

export type BackResolution = { show: boolean; fallback: string };

const WELCOME = "/welcome";

/** صفحات رئيسية لا شيء قبلها: لا يظهر عليها الزر */
const HOME_PATHS = new Set(["/", "/student", "/parent", "/mosque", "/association", "/dev", WELCOME]);

/** مسارات عامة (دخول/تسجيل…) تعود إلى الواجهة */
const PUBLIC_TO_WELCOME = new Set([
  "/login",
  "/signup",
  "/register-mosque",
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  "/admin",
  "/student-join",
  "/student-link",
  "/mosque-login",
  "/association-login",
  "/parent/login",
  "/parent/join",
]);

function normalize(pathname: string): string {
  const clean = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "");
  return clean === "" ? "/" : clean;
}

function parentOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx <= 0 ? "/" : path.slice(0, idx);
}

export function resolveBack(pathname: string): BackResolution {
  const path = normalize(pathname);

  if (HOME_PATHS.has(path)) return { show: false, fallback: path };
  if (PUBLIC_TO_WELCOME.has(path)) return { show: true, fallback: WELCOME };

  // ولي الأمر
  if (path === "/parent/fees/receipt") return { show: true, fallback: "/parent/fees" };
  if (path.startsWith("/parent/")) return { show: true, fallback: "/parent" };

  // الطالب
  if (path.startsWith("/student/")) return { show: true, fallback: "/student" };

  // المطوّر
  if (path.startsWith("/dev/")) return { show: true, fallback: "/dev" };

  // الجمعية
  if (path.startsWith("/association/")) {
    if (/^\/association\/visits\/[^/]+\/print$/.test(path)) return { show: true, fallback: parentOf(path) };
    if (/^\/association\/visits\/[^/]+$/.test(path)) return { show: true, fallback: "/association/visits" };
    return { show: true, fallback: "/association" };
  }

  // الجامع
  if (path === "/mosque/settings") return { show: true, fallback: "/mosque" };
  const m = /^\/mosque\/([^/]+)(\/.*)?$/.exec(path);
  if (m) {
    const base = `/mosque/${m[1]}`;
    const rest = m[2] ?? "";
    if (rest === "") return { show: true, fallback: "/mosque" };
    if (/^\/exams\/certificates\/[^/]+\/print$/.test(rest)) return { show: true, fallback: `${base}/exams` };
    if (/^\/fees\/[^/]+\/receipt\/[^/]+$/.test(rest)) return { show: true, fallback: `${base}/fees` };
    if (/^\/halaqah\/[^/]+$/.test(rest)) return { show: true, fallback: base };
    return { show: true, fallback: parentOf(path) };
  }

  // صفحات الانضمام العامة
  if (/^\/j\/[^/]+\/schedule$/.test(path)) return { show: true, fallback: parentOf(path) };
  if (path.startsWith("/j/") || path.startsWith("/verify/")) return { show: true, fallback: WELCOME };

  // المعلّم (المسارات بلا بادئة)
  if (/^\/students\/[^/]+$/.test(path)) return { show: true, fallback: "/students" };
  if (/^\/(cases|exams)\/[^/]+$/.test(path)) return { show: true, fallback: parentOf(path) };
  if (/^\/discipline\/(print|sheet)$/.test(path)) return { show: true, fallback: "/discipline" };
  return { show: true, fallback: "/" };
}

/** يضيف المسار الحالي لمكدّس الجلسة: رجوعٌ للمسار السابق يُخرج الأعلى، وتكرار نفس المسار يُتجاهل */
export function pushPath(stack: string[], pathname: string): string[] {
  const path = normalize(pathname);
  const last = stack[stack.length - 1];
  if (last === path) return stack;
  if (stack.length >= 2 && stack[stack.length - 2] === path) return stack.slice(0, -1);
  return [...stack, path].slice(-50);
}

export function canGoBackInApp(stack: string[]): boolean {
  return stack.length > 1;
}

export const NAV_STACK_KEY = "halaqat:nav-stack";
