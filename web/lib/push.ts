import "server-only";

import webpush from "web-push";
import {
  deletePushSubscription,
  listPushSubscriptions,
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
function ensureConfigured(): string | null {
  try {
    let keys = vapidKeys();
    if (!keys) {
      const generated = webpush.generateVAPIDKeys();
      setVapidKeys(generated.publicKey, generated.privateKey);
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

export function getVapidPublicKey(): string | null {
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
  const publicKey = ensureConfigured();
  if (!publicKey) return;

  const subs = listPushSubscriptions(teacherId);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
        );
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) deletePushSubscription(sub.endpoint);
      }
    }),
  );
}
