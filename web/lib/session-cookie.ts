import "server-only";

/*
  كوكيات الجلسات ببادئة __Host- — البادئة تفرض على المتصفح Secure وPath=/
  وبلا Domain، فلا تُرسل الكوكي إلى نطاق أخ ولا عبر http. تُستخدم فقط في
  الإنتاج (المتصفح يرفض __Host- بلا Secure، وdev على http).

  توافق خلفي كامل: القِراءة تجرّب الاسم الجديد ثم القديم، فالجلسات
  الصادرة قبل النشر تبقى صالحة حتى انتهائها؛ والكتابة تكتب الاسم الجديد
  وتحذف القديم من المتصفح نفسه؛ والحذف يمسح الاثنين.
*/

const HOST_PREFIX = "__Host-";

/** اسم الكوكي للكتابة: ببادئة __Host- في الإنتاج، والاسم القديم خارجه */
export function cookieNameForWrite(base: string): string {
  return process.env.NODE_ENV === "production" ? `${HOST_PREFIX}${base}` : base;
}

/** الاسمان المحتملان للكوكي (الجديد أولاً) — للقراءة والحذف معاً */
export function cookieNames(base: string): [string, string] {
  return [`${HOST_PREFIX}${base}`, base];
}

export type SessionCookieStore = {
  get(name: string): { value: string } | undefined;
  set(
    name: string,
    value: string,
    options: { httpOnly: true; sameSite: "lax"; secure: boolean; path: "/"; maxAge: number },
  ): unknown;
  delete(name: string): unknown;
};

export type SessionCookieAttributes = {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  maxAge: number;
};

/** خصائص الكوكي الموحّدة: httpOnly + sameSite=lax + secure في الإنتاج */
export function sessionCookieAttributes(maxAgeSeconds: number): SessionCookieAttributes {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/** يقرأ كوكي الجلسة: الاسم الجديد أولاً ثم القديم (توافق خلفي) */
export function readSessionCookie(store: SessionCookieStore, base: string): string | undefined {
  for (const name of cookieNames(base)) {
    const value = store.get(name)?.value;
    if (value !== undefined) return value;
  }
  return undefined;
}

/** يكتب الاسم الجديد ويحذف القديم من المتصفح نفسه (لا تبقى جلستان) */
export function writeSessionCookie(
  store: SessionCookieStore,
  base: string,
  value: string,
  maxAgeSeconds: number,
): void {
  store.set(cookieNameForWrite(base), value, sessionCookieAttributes(maxAgeSeconds));
  store.delete(base);
}

/** يمسح الاسمين معاً */
export function clearSessionCookie(store: SessionCookieStore, base: string): void {
  for (const name of cookieNames(base)) store.delete(name);
}
