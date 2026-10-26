import { currentTeacher, unauthorized } from "@/lib/auth";
import { halaqahBuddyResetOnEdit, setHalaqahBuddyResetOnEdit } from "@/lib/db";
import { getHalaqahStage, setHalaqahStage } from "@/lib/halaqah-stage-db";
import { parseStage, profileFor, type HalaqahStage } from "@/lib/halaqah-stage";
import { reviewTracksVisible } from "@/lib/stage-review-tracks";
import { reviewTrackConfigForHalaqah } from "@/lib/mosque/review-tracks-db";
import { logSecurityEvent } from "@/lib/audit-log";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

/**
 * ملف فئة الحلقة كما تراه الواجهة: الحقول التي تهم العرض فقط — الوحدة
 * الكاملة في lib/halaqah-stage.ts. pointsEnabled = افتراض الفئة حتى
 * تُطبَّق إعدادات نقاط الجامع (001 US5 بعد M2).
 */
async function stageProfilePayload(halaqahId: number, stage: HalaqahStage | null) {
  const profile = profileFor(stage);
  const { enabled } = await reviewTrackConfigForHalaqah(halaqahId);
  return {
    stage: profile.stage,
    unit: profile.unit,
    teacherRecords: profile.teacherRecords,
    pointsEnabled: profile.pointsDefault,
    reviewTracksVisible: reviewTracksVisible(profile, enabled),
  };
}

/** إعدادات الحلقة — القراءة لكل معلمي الحلقة (لعرض الحالة الحالية وتعطيل التبديل عن المساعدين) */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const stage = await getHalaqahStage(teacher.halaqahId);
  return Response.json({
    buddyResetOnEdit: await halaqahBuddyResetOnEdit(teacher.halaqahId),
    role: teacher.role,
    stage,
    stageProfile: await stageProfilePayload(teacher.halaqahId, stage),
  });
}

/**
 * يغيّر إعدادات الحلقة — مشرف الحلقة (المالك) فقط، بنمط
 * /api/teacher/invite/rotate حرفياً. halaqahId من الجلسة حصراً، لا من أي
 * مدخل عميل. الحقلان مستقلان: buddyResetOnEdit (boolean) وstage (قيمة
 * الفئة الأربع أو null) — وكل تغيير فئة يُسجَّل بحدث تدقيق أمني (FR-002).
 */
export async function PATCH(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.role !== "supervisor") {
    return Response.json({ error: "تغيير إعدادات الحلقة متاح لمشرف الحلقة فقط" }, { status: 403 });
  }
  if (!(await checkRateLimit(`teacher-settings:${teacher.halaqahId}`, 30, 3600))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { buddyResetOnEdit?: unknown; stage?: unknown };

  let stage: HalaqahStage | null | undefined;
  if ("stage" in body) {
    try {
      stage = parseStage(body.stage);
    } catch {
      return Response.json({ error: "قيمة غير صحيحة" }, { status: 400 });
    }
  }
  const hasBuddy = body.buddyResetOnEdit !== undefined;
  if (hasBuddy && typeof body.buddyResetOnEdit !== "boolean") {
    return Response.json({ error: "قيمة غير صحيحة" }, { status: 400 });
  }
  if (!hasBuddy && stage === undefined) {
    return Response.json({ error: "قيمة غير صحيحة" }, { status: 400 });
  }

  if (hasBuddy) {
    await setHalaqahBuddyResetOnEdit(teacher.halaqahId, body.buddyResetOnEdit as boolean);
  }
  if (stage !== undefined) {
    const from = await getHalaqahStage(teacher.halaqahId);
    await setHalaqahStage(teacher.halaqahId, stage);
    await logSecurityEvent({
      event: "halaqah.stage_change",
      actorKind: "teacher",
      actorId: teacher.id,
      details: { halaqahId: teacher.halaqahId, from, to: stage },
    });
  }
  return Response.json({ ok: true });
}
