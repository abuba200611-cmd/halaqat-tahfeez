import "server-only";

import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { isAdmin } from "./admin-auth";

/*
  من نفّذ الإجراء الإداري؟ للتدقيق فقط (permits_log، «قيّمه»): المشرف العام =
  developer، وإلا مدير الجامع صاحب الجلسة. يُستدعى بعد featureGate (الذي ضمن
  أن أحدهما مصرّح) فلا يُعتمد عليه كفحص صلاحية.
*/
export type MosqueActor = { kind: "mosque_admin" | "developer"; id: number | null; label: string };

export async function currentMosqueActor(): Promise<MosqueActor> {
  if (await isAdmin()) return { kind: "developer", id: null, label: "المشرف العام" };
  const admin = await currentMosqueAdmin();
  return { kind: "mosque_admin", id: admin?.id ?? null, label: "مدير الجامع" };
}
