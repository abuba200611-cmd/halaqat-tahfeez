import { NextResponse, type NextRequest } from "next/server";
import { isDevConsoleHost, requestHost } from "@/lib/hosts";
import { GOOGLE_HANDOFF_COOKIE, INTRO_COOKIE, SESSION_COOKIES, WELCOME_PATH, hasSessionCookieNamed, isRegistrationPath } from "@/lib/landing";
import { csrfBlocked } from "@/lib/csrf";

/*
  dev split — فصل لوحة المطوّر عن المنصة العامة بالمستضيج (Next 16:
  proxy.ts هي middleware السابقة). قاعدة واحدة بسيطة:

  - مستضيج عام (المنصة): مسارات اللوحة (/dev، /admin، /api/dev/*،
    /api/admin/*) تُعاد كتابتها لمسار غير موجود → صفحة 404 عادية، فلا
    تكشف المنصة أن اللوحة موجودة أصلاً.
  - مستضيج اللوحة (ملك المطوّر): كل شيء مسموح، و"/" وحدها تحوّل لـ/dev
    ما لم يكن كوكي «عرض كـ» فعّالاً — فالهبوط على "/" أثناء العرض
    المنتحَل (صفحة المعلّم) يجب أن يعمل لا أن يرتد للوحة.

  هذا الطبقة الأولى؛ الحرّاس الخادمية (lib/host-gate.ts وdevConsoleGate
  وفحوص جلسة الأدمن) ترفض مستضيفياً غير المصرّح حتى لو التُحمت هذه.

  بوابة الترحيب (مستضيج المنصة فقط — اللوحة لا تمر بها):
  1. "/" بلا جلسة أي دور → إعادة كتابة (لا تحويل) إلى /welcome، فيبقى
     الرابط "/" والمسجّلون يبقون على لوحاتهم.
  2. مسارات التسجيل العامة بلا كوكي mos_intro → تحويل إلى
     /welcome?next=<المسار الأصلي بمعاملاته>؛ الصفحة الترحيبية تضبط
     الكوكي وتعرض «متابعة التسجيل» عائدة بالمسار نفسه.
*/

/** مسار غير موجود بأي مجموعة routes — إعادة الكتابة إليه تنتج 404 عادي */
const NOT_FOUND_PATH = "/--console-not-found";

function isConsolePath(pathname: string): boolean {
  return (
    pathname === "/dev" ||
    pathname.startsWith("/dev/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname === "/api/dev" ||
    pathname.startsWith("/api/dev/") ||
    pathname === "/api/admin" ||
    pathname.startsWith("/api/admin/")
  );
}

/** هل مع الطلب كوكي جلسة لأي دور؟ (فحص وجود متفائل فقط — التحقق الكامل خادمي) */
function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => hasSessionCookieNamed((n) => request.cookies.get(n), name));
}

export function proxy(request: NextRequest) {
  const devHost = isDevConsoleHost(requestHost(request.headers));
  const { pathname, search } = request.nextUrl;

  // ————— فحص CSRF المركزي —————
  // قبل أي منطق آخر: طلب مغيِّر إلى /api/* من أصل غير مستضيج الطلب → 403.
  // المسارات ذات التوقيع/السرّ الخاص (webhooks/link/v1) مستثناة داخل lib/csrf.ts.
  if (csrfBlocked(request.method, pathname, request.headers)) {
    return NextResponse.json({ error: "طلب مرفوض (فحص الأصل)" }, { status: 403 });
  }

  if (!devHost && isConsolePath(pathname)) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
  }

  if (devHost) {
    // مستضيج اللوحة ملك المطوّر: لا ترحيب ولا بوابة تسجيل هنا
    if (pathname === "/" && !request.cookies.get("dev_imp")) {
      return NextResponse.redirect(new URL("/dev", request.url));
    }
    return NextResponse.next();
  }

  // ————— المنصة العامة —————

  // الهبوط على "/" بلا جلسة → الترحيب. استثناء: روابط قديمة تحمل
  // معاملات (دعوة معلّم زميل /?join=، وخطأ جوجل /?googleError=) يضيع
  // معناها بالإعادة الكاتبة، فتوجَّه لصفحة التسجيل نفسها بمعاملاتها.
  const loggedIn = hasSessionCookie(request);
  if (pathname === "/" && !loggedIn) {
    const params = request.nextUrl.searchParams;
    if (params.has("join") || params.has("googleError")) {
      return NextResponse.redirect(new URL(`/signup${search}`, request.url));
    }
    return NextResponse.rewrite(new URL(WELCOME_PATH, request.url));
  }

  // من معه جلسة مستخدم قائم لا مسجِّل جديد — لا نرجعه للترحيب
  // تسليم جوجل (كوكي موقّع ١٠ دقائق) يُعدّ مروراً بالترحيب: فحص وجود متفائل
  // هنا، والتحقق من التوقيع والصلاحية خادمي عند /api/auth/register
  const introPassed =
    request.cookies.get(INTRO_COOKIE) !== undefined || request.cookies.get(GOOGLE_HANDOFF_COOKIE) !== undefined;
  if (!loggedIn && isRegistrationPath(pathname) && !introPassed) {
    const welcome = new URL(WELCOME_PATH, request.url);
    welcome.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(welcome);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/dev/:path*",
    "/admin/:path*",
    "/api/:path*",
    "/signup",
    "/register-mosque",
    "/register-association",
    "/student-join",
    "/student-link",
    "/parent/join",
    "/j/:path*",
  ],
};
