/*
  ربط الجوامع بالجمعيات — منطق التفويض النقي (بلا قاعدة بيانات) ليُختبر مباشرة
  ويشاركه الخادم. القاعدة: كل طلب ربط يقرره **الطرف المقابل لمن أرسله** فقط،
  وبهويته الحقيقية من الجلسة:
  - طلب أرسلته جمعية ⇒ يقرره مدير **الجامع المستهدف** نفسه (لا مدير جامع آخر،
    ولا الجمعية المرسلة، ولا المشرف العام من هذا المسار).
  - طلب أرسله جامع (عند تسجيله) ⇒ تقرره **الجمعية المستهدفة** نفسها.
*/

export type LinkRequestedBy = "mosque" | "association";
export type LinkStatus = "pending" | "approved" | "declined";

export type LinkRecord = {
  id: number;
  mosqueId: number;
  associationId: number;
  requestedBy: LinkRequestedBy;
  status: LinkStatus;
};

export type LinkActor =
  | { kind: "mosque_admin"; mosqueId: number }
  | { kind: "association_admin"; associationId: number };

export type LinkAuthz = { ok: true } | { ok: false; code: "forbidden" | "already_decided" };

/** هل يحق لهذا الفاعل البتّ في هذا الطلب؟ */
export function authorizeLinkDecision(link: LinkRecord, actor: LinkActor): LinkAuthz {
  const mayDecide =
    link.requestedBy === "association"
      ? actor.kind === "mosque_admin" && actor.mosqueId === link.mosqueId
      : actor.kind === "association_admin" && actor.associationId === link.associationId;
  // الصلاحية تُفحص قبل الحالة: من لا يملك الطلب لا يعرف إن كان مبتوتاً فيه
  if (!mayDecide) return { ok: false, code: "forbidden" };
  if (link.status !== "pending") return { ok: false, code: "already_decided" };
  return { ok: true };
}

export const LINK_STATUS_LABEL: Record<LinkStatus, string> = {
  pending: "بانتظار الموافقة",
  approved: "مقبول",
  declined: "مرفوض",
};
