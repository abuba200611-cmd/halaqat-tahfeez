import { NextResponse, type NextRequest } from "next/server";
import { isDevConsoleHost, requestHost } from "@/lib/hosts";

/*
  dev split — فصل لوحة المطوّر عن المنصة العامة بالمستضيج (Next 16:
  proxy.ts هي middleware السابقة). قاعدة واحدة بسيطة:

  - مستضيف عام (المنصة): مسارات اللوحة (/dev، /admin، /api/dev/*،
    /api/admin/*) تُعاد كتابتها لمسار غير موجود → صفحة 404 عادية، فلا
    تكشف المنصة أن اللوحة موجودة أصلاً.
  - مستضيج اللوحة (ملك المطوّر): كل شيء مسموح، و"/" وحدها تحوّل لـ/dev
    ما لم يكن كوكي «عرض كـ» فعّالاً — فالهبوط على "/" أثناء العرض
    المنتحَل (صفحة المعلّم) يجب أن يعمل لا أن يرتد للوحة.

  هذا الطبقة الأولى؛ الحرّاس الخادمية (lib/host-gate.ts وdevConsoleGate
  وفحوص جلسة الأدمن) ترفض مستضيفياً غير المصرّح حتى لو التُحمت هذه.
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

export function proxy(request: NextRequest) {
  const devHost = isDevConsoleHost(requestHost(request.headers));
  const { pathname } = request.nextUrl;

  if (!devHost && isConsolePath(pathname)) {
    return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url));
  }

  if (devHost && pathname === "/" && !request.cookies.get("dev_imp")) {
    return NextResponse.redirect(new URL("/dev", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/dev/:path*", "/admin/:path*", "/api/dev/:path*", "/api/admin/:path*"],
};
