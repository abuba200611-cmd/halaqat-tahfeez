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
