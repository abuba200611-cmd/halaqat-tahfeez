import "server-only";
import { timingSafeEqual } from "node:crypto";

/**
 * مقارنة سرّين بزمن ثابت — تفحص تساوي الطول أولاً (timingSafeEqual ترمي
 * لو اختلف طول البافرين)، فلا ترمي أبداً ولا تفتح أي مقارنة عادية.
 * فحص الطول المسبق يكشف طول السرّ (لا محتواه) — هذا مقبول ومقصود؛ لا
 * يجوز حذفه لاحقاً "تحسيناً"، فحذفه يجعل timingSafeEqual ترمي عند
 * اختلاف الأطوال بدل إرجاع false بأمان.
 *
 * مصدر وحيد لكل مقارنة سرّ بالمشروع (STEP 37 — F-04): LINK_SECRET
 * بـlib/link-auth.ts، وADMIN_SECRET بـadmin/login وadmin/suggestions.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * ADMIN_SECRET من البيئة، بعد trim() — مقارنة بايت-لبايت (safeEqual
 * أعلاه) تفشل كلياً لو حملت قيمة متغيّر البيئة مسافة أو سطراً جديداً
 * زائداً بآخرها (شائع جداً عند اللصق من واجهة Vercel أو من أداة توليد
 * سرّ)، رغم أن كلمة السر المكتوبة صحيحة تماماً. مصدر وحيد يُستخدَم في
 * الثلاثة مواضع التي تقرأ ADMIN_SECRET (admin/login،
 * admin/suggestions، admin/suggestions/attachments/[id]) فيبقى
 * التعريف — ومعه أي إصلاح مستقبلي — بمكان واحد لا ثلاثة.
 */
export function expectedAdminSecret(): string {
  return (process.env.ADMIN_SECRET ?? "").trim();
}
