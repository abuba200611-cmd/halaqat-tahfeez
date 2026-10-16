/*
  دوال نقية لسكربت دمج بيانات نظام الجامع (scripts/merge-masjid-data.mjs)
  — إعادة رسم المعرّفات عبر خريطة المصدر→الهدف، وتطابق الحلقات برمز
  الدعوة، وقواعد الروابط التي لا نظير لها. بلا أي استيراد أو آثار جانبية:
  تُختبر مباشرة بـ Vitest، ويستوردها السكربت عبر Node (strip types).
*/

export type IdMap = ReadonlyMap<number, number>;

/** خرائط المعرّفات لكل جدول منقول (معرّف المصدر → معرّف الهدف) */
export type MergeIdMaps = {
  mosques: IdMap;
  /** حلقات نظام الجامع (روابط) → حلقات halaqahs الحقيقية بالهدف */
  halaqahs: IdMap;
  /** pending_students بالمصدر → mosque_registrations بالهدف */
  pendingStudents: IdMap;
  mosqueMembers: IdMap;
  families: IdMap;
  committees: IdMap;
  evaluationCriteria: IdMap;
  activities: IdMap;
  badges: IdMap;
};

export function emptyMergeIdMaps(): { -readonly [K in keyof MergeIdMaps]: Map<number, number> } {
  return {
    mosques: new Map(),
    halaqahs: new Map(),
    pendingStudents: new Map(),
    mosqueMembers: new Map(),
    families: new Map(),
    committees: new Map(),
    evaluationCriteria: new Map(),
    activities: new Map(),
    badges: new Map(),
  };
}

/** رمز رمز الدعوة → معرّف، والرموز المكررة تُستبعد كلها (غامضة) */
export function buildUniqueCodeIndex(
  rows: readonly { id: number; code: string | null }[],
): ReadonlyMap<string, number> {
  const seenOnce = new Map<string, number>();
  const duplicated = new Set<string>();
  for (const row of rows) {
    if (!row.code) continue;
    if (duplicated.has(row.code)) continue;
    if (seenOnce.has(row.code)) {
      seenOnce.delete(row.code);
      duplicated.add(row.code);
      continue;
    }
    seenOnce.set(row.code, row.id);
  }
  return seenOnce;
}

export type HalaqahCodeMatch = { targetId: number; via: "invite_code" | "teacher_invite_code" };

/**
 * يطابق حلقة نظام الجامع على حلقة حقيقية برمز دعوتها: رمز الطلاب
 * (invite_code) مقدم على رمز المعلّمين (teacher_invite_code)، ولا تطابق
 * لو غاب عن الاثنين أو تكرر بالفهرس (رمز غامض).
 */
export function matchHalaqahByInviteCode(
  code: string | null,
  studentCodeIndex: ReadonlyMap<string, number>,
  teacherCodeIndex: ReadonlyMap<string, number>,
): HalaqahCodeMatch | null {
  if (!code) return null;
  const byStudent = studentCodeIndex.get(code);
  if (byStudent !== undefined) return { targetId: byStudent, via: "invite_code" };
  const byTeacher = teacherCodeIndex.get(code);
  if (byTeacher !== undefined) return { targetId: byTeacher, via: "teacher_invite_code" };
  return null;
}

/** صفوف العرض التجريبي برموز مثل DEMO-123 — تُتوقع بلا نظير بالهدف */
export function isDemoInviteCode(code: string | null): boolean {
  return !!code && /^DEMO-/i.test(code);
}

/**
 * يطابق جامع المصدر على جامع قائم بالهدف بالاسم والمدينة معاً (تطابق
 * تام). لا تطابق لو الغموض: اسمان متطابقان بالهدف → null (يفضَّل الإدراج
 * على الربط بغير موثوق).
 */
export function matchMosqueByNameCity(
  name: string,
  city: string,
  targetMosques: readonly { id: number; name: string; city: string }[],
): number | null {
  const matches = targetMosques.filter((mosque) => mosque.name === name && mosque.city === city);
  return matches.length === 1 ? matches[0].id : null;
}

/** معرّف فرد (طالب تسجيل أو عضو حر) بعد النقل — null لو لا نظير له */
export function remapMemberId(
  kind: "student" | "member",
  id: number,
  maps: MergeIdMaps,
): number | null {
  const map = kind === "student" ? maps.pendingStudents : maps.mosqueMembers;
  return map.get(id) ?? null;
}

/** معرّف هدف التقييم (أسرة أو طالب) بعد النقل */
export function remapEvaluationTargetId(
  kind: "family" | "student",
  id: number,
  maps: MergeIdMaps,
): number | null {
  const map = kind === "family" ? maps.families : maps.pendingStudents;
  return map.get(id) ?? null;
}

/** معرّف هدف الوسام (طالب أو أسرة أو عضو حر) بعد النقل */
export function remapBadgeTargetId(
  kind: "student" | "family" | "member",
  id: number,
  maps: MergeIdMaps,
): number | null {
  const map =
    kind === "student" ? maps.pendingStudents : kind === "family" ? maps.families : maps.mosqueMembers;
  return map.get(id) ?? null;
}

export type ActivityTagKind = "halaqah" | "family" | "committee";
export type RemappedActivityTag = { tagKind: ActivityTagKind | null; tagId: number | null };

/**
 * وسم النشاط بعد النقل: halaqah يتبع خريطة تطابق الحلقات، وfamily/
 * committee خرائط الإدراج. وسم بلا نظير (كحلقة DEMO-) يُسقط كلياً —
 * النشاط يبقى بلا وسم بدل حذفه.
 */
export function remapActivityTag(
  tagKind: ActivityTagKind | null,
  tagId: number | null,
  maps: MergeIdMaps,
): RemappedActivityTag {
  if (tagKind === null || tagId === null) return { tagKind: null, tagId: null };
  const map =
    tagKind === "halaqah" ? maps.halaqahs : tagKind === "family" ? maps.families : maps.committees;
  const mapped = map.get(tagId);
  return mapped === undefined ? { tagKind: null, tagId: null } : { tagKind, tagId: mapped };
}

export type ProgramKind = "halaqah" | "family" | "committee" | "lecture" | "sport" | "cultural" | "other";

/**
 * ref_id لخانة الجدول الأسبوعي بعد النقل: أنواع halaqah/family/committee
 * تتبع خرائطها، والبرامج الحرة (lecture/sport/cultural/other) تمر كما هي.
 */
export function remapScheduleRef(
  programKind: ProgramKind,
  refId: number | null,
  maps: MergeIdMaps,
): number | null {
  if (refId === null) return null;
  if (programKind === "halaqah") return maps.halaqahs.get(refId) ?? null;
  if (programKind === "family") return maps.families.get(refId) ?? null;
  if (programKind === "committee") return maps.committees.get(refId) ?? null;
  return refId;
}

export type RegistrationAssignment = {
  halaqahId: number | null;
  status: string;
  assignedAt: string | null;
};

/**
 * توزيع التسجيل بعد النقل: الحلقة المطابَقة تُنقل مع حالتها كما هي،
 * والحلقة بلا نظير (DEMO-) تجعل التسجيل "غير موزَّع": halaqah_id خالٍ
 * والحالة pending — لا يبقى "assigned" بلا حلقة.
 */
export function resolveRegistrationAssignment(
  source: RegistrationAssignment,
  mappedHalaqahId: number | null,
): RegistrationAssignment {
  if (source.halaqahId === null) return { ...source };
  if (mappedHalaqahId === null) return { halaqahId: null, status: "pending", assignedAt: null };
  return { halaqahId: mappedHalaqahId, status: source.status, assignedAt: source.assignedAt };
}

/** فصل صفوف لم تُنسخ بعد عما سُجِّل سابقاً في merge_id_map (إعادة التشغيل) */
export function splitPendingRows<T extends { id: number }>(
  rows: readonly T[],
  existing: IdMap,
): { toCopy: T[]; alreadyCopied: T[] } {
  const toCopy: T[] = [];
  const alreadyCopied: T[] = [];
  for (const row of rows) {
    if (existing.has(row.id)) alreadyCopied.push(row);
    else toCopy.push(row);
  }
  return { toCopy, alreadyCopied };
}
