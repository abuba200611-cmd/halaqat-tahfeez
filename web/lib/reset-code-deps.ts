import "server-only";

import {
  bumpResetCodeAttempt,
  burnResetCode,
  findTeacherByUsername,
  replaceResetCode,
  sessionSecret,
  setTeacherPasswordViaReset,
} from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { checkRateLimit } from "@/lib/rate-limit";
import type { ResetDeps } from "@/lib/reset-code";

/** الاعتماديات الحقيقية (قاعدة البيانات + البريد) — الاختبارات تحقن بدائل في الذاكرة */
export const realResetDeps: ResetDeps = {
  now: () => new Date(),
  secret: sessionSecret,
  findTeacher: async (email) => {
    const t = await findTeacherByUsername(email);
    return t ? { id: t.id, deactivatedAt: t.deactivatedAt ?? null } : null;
  },
  replaceCode: replaceResetCode,
  bumpAttempt: bumpResetCodeAttempt,
  burn: burnResetCode,
  sendMail,
  setPassword: setTeacherPasswordViaReset,
  rateLimit: checkRateLimit,
};
