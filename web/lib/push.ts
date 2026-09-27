import "server-only";

import webpush from "web-push";
import {
  deletePushSubscription,
  deleteStudentPushSubscription,
  listHalaqahTeachers,
  listPushSubscriptions,
  listStudentPushSubscriptions,
  listStudentPushSubscriptionsForReminder,
  markStudentPushSubscriptionSuccess,
  setVapidKeys,
  vapidKeys,
} from "./db";

/*
  إشعارات الويب (Web Push) عبر مكتبة web-push — جافاسكربت خالص بلا تبعيات native.
  مفاتيح VAPID تُولَّد مرة واحدة وتُحفظ في الإعدادات، فتثبت الاشتراكات عبر التشغيل.
  البروتوكول (تعمية الحمولة وتوقيع VAPID) معقّد بما يكفي ليكون تفويضه للمكتبة أسلم
  من كتابته يدوياً بـ node:crypto.
*/

const CONTACT = "mailto:halaqat@example.com";
let configured = false;

/** يضمن وجود مفاتيح VAPID وضبط المكتبة، ويرجع المفتاح العام (أو null عند التعذّر) */
async function ensureConfigured(): Promise<string | null> {
  try {
    let keys = await vapidKeys();
    if (!keys) {
      const generated = webpush.generateVAPIDKeys();
      await setVapidKeys(generated.publicKey, generated.privateKey);
      keys = generated;
    }
    if (!configured) {
      webpush.setVapidDetails(CONTACT, keys.publicKey, keys.privateKey);
      configured = true;
    }
    return keys.publicKey;
  } catch {
    return null;
  }
}

export async function getVapidPublicKey(): Promise<string | null> {
  return ensureConfigured();
}

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
};

/**
 * يرسل إشعاراً لكل أجهزة المعلّم. الاشتراكات المنتهية (404/410) تُحذف تلقائياً.
 * لا يرمي أبداً — فشل الإشعار يجب ألا يُفشل حفظ الورد.
 */
export async function sendPushToTeacher(teacherId: number, payload: PushPayload): Promise<void> {
  const publicKey = await ensureConfigured();
  if (!publicKey) return;

  const subs = await listPushSubscriptions(teacherId);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await deletePushSubscription(sub.endpoint);
      }
    }),
  );
}

/**
 * يرسل إشعاراً لكل معلّمي الحلقة معاً (المشرف وكل المساعدين) — حلقة
 * واحدة قد تجمع أكثر من حساب معلّم الآن، فإشعار "وارد جديد" مثلاً
 * يجب أن يصل الجميع لا صاحب الحساب الأول فقط.
 */
export async function sendPushToHalaqah(halaqahId: number, payload: PushPayload): Promise<void> {
  const teachers = await listHalaqahTeachers(halaqahId);
  await Promise.all(teachers.map((t) => sendPushToTeacher(t.id, payload)));
}

/**
 * يرسل إشعاراً لكل أجهزة طالب بعينه (STEP 54) — إشعار فوري عند اعتماد
 * أو رفض ورده. لا يرمي أبداً — نفس مبدأ sendPushToTeacher.
 */
export async function sendPushToStudent(teacherId: number, studentId: string, payload: PushPayload): Promise<void> {
  const publicKey = await ensureConfigured();
  if (!publicKey) return;

  const subs = await listStudentPushSubscriptions(teacherId, studentId);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
        await markStudentPushSubscriptionSuccess(sub.endpoint);
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await deleteStudentPushSubscription(sub.endpoint);
      }
    }),
  );
}

export type ReminderResult = { sent: number; skipped: number; removed: number; failed: number };

/**
 * التذكير اليومي (STEP 54) — يرسل فقط لاشتراكات الطلاب الذين لم يسجّلوا
 * ورداً بتاريخ `today` (يُحسب بتوقيت الرياض في المستدعي، مسار الـcron).
 * كل اشتراك يُعامَل باستقلال: فشل جهاز واحد (404/410 يُحذف، أي خطأ آخر
 * يُعدّ failed) لا يوقف إرسال البقية — نفس مبدأ sendPushToTeacher.
 */
export async function runStudentDailyReminder(today: string): Promise<ReminderResult> {
  const result: ReminderResult = { sent: 0, skipped: 0, removed: 0, failed: 0 };
  const publicKey = await ensureConfigured();
  if (!publicKey) return result;

  const rows = await listStudentPushSubscriptionsForReminder(today);
  const payload: PushPayload = {
    title: "تذكير",
    body: "لا تنسَ تسجيل وردك اليوم 📖",
    url: "/student",
    tag: "daily-reminder",
  };

  await Promise.all(
    rows.map(async (row) => {
      if (row.hasWardToday) {
        result.skipped++;
        return;
      }
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
        );
        await markStudentPushSubscriptionSuccess(row.endpoint);
        result.sent++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await deleteStudentPushSubscription(row.endpoint);
          result.removed++;
        } else {
          result.failed++;
        }
      }
    }),
  );

  return result;
}
