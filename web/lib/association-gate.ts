import "server-only";

import { currentAssociationAdmin } from "./association-auth";
import { getMosqueAssociationId, type AssociationAdmin } from "./association-db";
import { mosqueBelongsToAssociation } from "./association";

/*
  بوابة مسارات /api/association/*: جلسة مدير جمعية صالحة (401 وإلا)، وللمسارات
  الخاصة بجامع: الجامع يتبع جمعيته بالذات وإلا 404 بردّ واحد لا يفرّق بين
  «جامع غير موجود» و«جامع جمعية أخرى» و«جامع بلا جمعية» — فلا يُكشف وجوده.
  كل المسارات خلفها قراءة فقط (GET)، ولا تستدعي أيّ مسار تعديل لمزايا الجامع.
*/

export function associationUnauthorized(): Response {
  return Response.json({ error: "غير مصرّح" }, { status: 401 });
}

export function associationNotFound(): Response {
  return Response.json({ error: "غير موجود" }, { status: 404 });
}

export async function requireAssociationAdmin(): Promise<{ admin: AssociationAdmin } | { response: Response }> {
  const admin = await currentAssociationAdmin();
  return admin ? { admin } : { response: associationUnauthorized() };
}

export async function requireAssociationMosque(
  mosqueParam: string,
): Promise<{ admin: AssociationAdmin; mosqueId: number } | { response: Response }> {
  const auth = await requireAssociationAdmin();
  if ("response" in auth) return auth;
  if (!/^[0-9]+$/.test(mosqueParam)) return { response: associationNotFound() };
  const mosqueId = Number(mosqueParam);
  if (!Number.isSafeInteger(mosqueId) || mosqueId <= 0) return { response: associationNotFound() };

  const mosqueAssociationId = await getMosqueAssociationId(mosqueId);
  if (!mosqueBelongsToAssociation(mosqueAssociationId, auth.admin.associationId)) {
    return { response: associationNotFound() };
  }
  return { admin: auth.admin, mosqueId };
}
