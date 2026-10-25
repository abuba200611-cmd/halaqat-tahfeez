import "server-only";

import { currentTeacher, currentStudent } from "@/lib/auth";
import { currentParent } from "@/lib/parent-auth";
import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { currentAssociationAdmin } from "@/lib/association-auth";
import { getMosque } from "@/lib/mosque/db";
import { getAssociation } from "@/lib/association-db";
import type { DeletionRequesterKind } from "@/lib/data-requests";

export const DELETION_KINDS: readonly DeletionRequesterKind[] = [
  "teacher",
  "parent",
  "student",
  "mosque_admin",
  "association_admin",
];

export function isDeletionKind(value: unknown): value is DeletionRequesterKind {
  return typeof value === "string" && (DELETION_KINDS as readonly string[]).includes(value);
}

export type DeletionIdentity = { ref: string; displayName: string };

/**
 * هوية الطالب للحذف من جلسة الدور المطلوب نفسه (لا من العميل): كل نوع يقرأ
 * كوكي دوره فقط، فمن لا جلسة له بذلك الدور يرجع null ولا يستطيع رفع طلب باسم غيره.
 */
export async function deletionIdentityFor(kind: DeletionRequesterKind): Promise<DeletionIdentity | null> {
  switch (kind) {
    case "teacher": {
      const t = await currentTeacher();
      return t ? { ref: `teacher:${t.id}`, displayName: `${t.teacherName || t.username} (${t.username})` } : null;
    }
    case "student": {
      const s = await currentStudent();
      return s ? { ref: `student:${s.teacherId}:${s.id}`, displayName: `${s.name} — ${s.halaqahName}` } : null;
    }
    case "parent": {
      const p = await currentParent();
      return p ? { ref: `parent:${p.id}`, displayName: `${p.name} (${p.email})` } : null;
    }
    case "mosque_admin": {
      const a = await currentMosqueAdmin();
      if (!a) return null;
      const mosque = await getMosque(a.mosqueId);
      return { ref: `mosque_admin:${a.id}`, displayName: `${a.username} — ${mosque?.name ?? `جامع #${a.mosqueId}`}` };
    }
    case "association_admin": {
      const a = await currentAssociationAdmin();
      if (!a) return null;
      const association = await getAssociation(a.associationId);
      return { ref: `association_admin:${a.id}`, displayName: `${a.username} — ${association?.name ?? `جمعية #${a.associationId}`}` };
    }
  }
}
