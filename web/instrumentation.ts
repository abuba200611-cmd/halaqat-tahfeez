import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: 0,
    });
  }
}

// يلتقط أخطاء مسارات الخادم غير الملتقَطة (API routes وRSC) تلقائياً —
// بدونه Sentry.init() وحده لا يكفي، لأن الأخطاء غير الملتقَطة بمسارات
// Next.js لا تمرّ من داخل SDK إلا عبر هذا الخطّاف الرسمي.
export const onRequestError = Sentry.captureRequestError;
