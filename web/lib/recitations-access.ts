import "server-only";

import { currentStudent, currentTeacher } from "./auth";
import { currentParent } from "./parent-auth";
import { getParentChild } from "./parent-db";
import type { RecitationMeta } from "./recitations-db";

/*
  STEP 64 — من يحق له سماع تلاوة: (١) الطالب صاحبها، (٢) معلّم/مساعد نفس
  حلقتها، (٣) ولي أمر مرتبط بهذا الطالب. غير ذلك لا يصل (المستدعي يردّ 404
  متطابقاً — لا فرق بين "غير موجودة" و"ليست لك").
  كل جلسة تُفحَص باستقلال: الجهاز قد يحمل أكثر من كوكي جلسة معاً.
*/
export async function canListenToRecitation(meta: Pick<RecitationMeta, "halaqahId" | "studentId">): Promise<boolean> {
  const student = await currentStudent();
  if (student && student.teacherId === meta.halaqahId && student.id === meta.studentId) return true;

  const teacher = await currentTeacher();
  if (teacher && teacher.halaqahId === meta.halaqahId) return true;

  const parent = await currentParent();
  if (parent && (await getParentChild(parent.id, meta.halaqahId, meta.studentId))) return true;

  return false;
}
