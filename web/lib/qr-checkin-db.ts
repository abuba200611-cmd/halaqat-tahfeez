import "server-only";

import { getMosqueIdForHalaqah } from "./discipline-db";
import { sessionSecret } from "./db";
import { isFeatureEnabled } from "./mosque/db";
import { QR_ATTENDANCE_FEATURE_KEY } from "./qr-checkin";

/*
  بوابة الحضور بالرمز: الحلقة مربوطة بجامع فعّلت ميزة qr_attendance. الحلقة
  تأتي من جلسة المعلّم/الطالب فقط. السرّ هو سرّ الجلسات الخادمي الموجود
  (SESSION_SECRET أو app_settings) — لا سرّ جديد ولا متغيّر بيئة جديد.
*/

export async function qrAttendanceEnabledForHalaqah(halaqahId: number): Promise<boolean> {
  const mosqueId = await getMosqueIdForHalaqah(halaqahId);
  if (mosqueId === null) return false;
  return isFeatureEnabled(mosqueId, QR_ATTENDANCE_FEATURE_KEY);
}

export async function checkinSecret(): Promise<string> {
  return sessionSecret();
}
