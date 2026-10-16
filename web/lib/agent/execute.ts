import "server-only";

import {
  awardBadge,
  checkScheduleRef,
  createCommitteeTask,
  createFamily,
  createScheduleSlot,
  findBadgeTargetName,
  getBadge,
  isFeatureEnabled,
  setMosqueFeature,
} from "@/lib/mosque/db";
import { getFeature } from "@/lib/mosque/features";
import { parseSlotBody } from "@/lib/mosque/schedule";
import { parseWeekStart, formatWeek } from "@/lib/mosque/evaluation";
import { logDevAction } from "@/lib/dev-audit";
import { text, parseIntIn } from "@/lib/mosque/api-gate";

/*
  تنفيذ مقترح بعد ضغطة الإنسان «نفّذ». لا يثق بشيء حُفظ وقت إنشاء
  المقترح: الحمولة تُعاد التحقق كاملة بنفس قواعد مسارات المزايا، وكل
  معرّف (وسام/لجنة/هدف/ربط جدول) يُفحص انتماؤه لنفس الجامع من جديد،
  والميزة المعنية يجب أن تكون ما زالت مفعّلة. أي إخفاق = failed برسالة،
  ولا يُلمس أي صف.
*/

export type ProposalExecution = { ok: true; message: string } | { ok: false; error: string };

/** ميزة القسم التي يحرسها كل نوع مقترح — نفس بوابات مسارات المزايا */
const KIND_FEATURE: Record<string, string> = {
  create_family: "families",
  create_committee_task: "committees",
  award_badge: "badges",
  add_schedule_slot: "weekly_schedule",
};

export async function executeAgentProposal(
  mosqueId: number,
  kind: string,
  payload: Record<string, unknown>,
): Promise<ProposalExecution> {
  const guard = KIND_FEATURE[kind];
  if (guard && !(await isFeatureEnabled(mosqueId, guard))) {
    return { ok: false, error: "الميزة المعنية معطّلة الآن لهذا الجامع" };
  }

  switch (kind) {
    case "toggle_feature": {
      const feature = getFeature(String(payload.key ?? ""));
      if (!feature || feature.status !== "ready") return { ok: false, error: "ميزة غير معروفة أو «قريباً»" };
      if (typeof payload.enabled !== "boolean") return { ok: false, error: "قيمة enabled غير صالحة" };
      await setMosqueFeature(mosqueId, feature.key, payload.enabled);
      await logDevAction("feature_toggle", "mosque", mosqueId, { key: feature.key, enabled: payload.enabled, via: "agent" });
      return { ok: true, message: payload.enabled ? `فُعِّلت «${feature.nameAr}»` : `عُطِّلت «${feature.nameAr}»` };
    }

    case "create_family": {
      const name = text(payload.name, 100);
      if (!name) return { ok: false, error: "اسم الأسرة مطلوب" };
      const family = await createFamily(mosqueId, {
        name,
        leaderName: text(payload.leaderName, 100),
        notes: text(payload.notes, 1000),
      });
      return { ok: true, message: `أُنشئت أسرة «${family.name}»` };
    }

    case "create_committee_task": {
      const committeeId = parseIntIn(payload.committeeId, 1, Number.MAX_SAFE_INTEGER);
      if (Number.isNaN(committeeId)) return { ok: false, error: "معرّف اللجنة غير صالح" };
      const title = text(payload.title, 200);
      if (!title) return { ok: false, error: "عنوان المهمة مطلوب" };
      const dueDateRaw = typeof payload.dueDate === "string" ? payload.dueDate : "";
      if (dueDateRaw && !parseWeekStart(dueDateRaw)) return { ok: false, error: "تاريخ الاستحقاق غير صالح" };
      const task = await createCommitteeTask(mosqueId, committeeId, { title, dueDate: dueDateRaw || null });
      if (!task) return { ok: false, error: "اللجنة غير موجودة بهذا الجامع" };
      return { ok: true, message: `أُنشئت المهمة «${task.title}»` };
    }

    case "award_badge": {
      const badgeId = parseIntIn(payload.badgeId, 1, Number.MAX_SAFE_INTEGER);
      if (Number.isNaN(badgeId)) return { ok: false, error: "معرّف الوسام غير صالح" };
      const kind = payload.targetKind;
      if (kind !== "student" && kind !== "family" && kind !== "member") return { ok: false, error: "نوع الهدف غير صالح" };
      const targetId = parseIntIn(payload.targetId, 1, Number.MAX_SAFE_INTEGER);
      if (Number.isNaN(targetId)) return { ok: false, error: "معرّف الهدف غير صالح" };

      const badge = await getBadge(mosqueId, badgeId);
      if (!badge) return { ok: false, error: "الوسام غير موجود بهذا الجامع" };
      if ((await findBadgeTargetName(mosqueId, kind, targetId)) === null) {
        return { ok: false, error: "الهدف ليس من هذا الجامع" };
      }

      let awardedAt = formatWeek(new Date());
      if (typeof payload.awardedAt === "string" && payload.awardedAt) {
        if (!parseWeekStart(payload.awardedAt)) return { ok: false, error: "تاريخ المنح غير صالح" };
        awardedAt = payload.awardedAt;
      }

      const award = await awardBadge(mosqueId, badgeId, kind, targetId, awardedAt, text(payload.note, 200));
      if (award === null) return { ok: false, error: "الوسام غير موجود بهذا الجامع" };
      if (award === "duplicate") return { ok: false, error: "مُنح هذا الوسام لنفس الهدف اليوم أصلاً" };
      return { ok: true, message: `مُنح «${badge.name}» لـ«${award.targetName}»` };
    }

    case "add_schedule_slot": {
      const { slot, error } = parseSlotBody(payload);
      if (!slot) return { ok: false, error: error ?? "خانة الجدول غير صالحة" };
      const refError = await checkScheduleRef(mosqueId, slot);
      if (refError) return { ok: false, error: refError };
      const created = await createScheduleSlot(mosqueId, slot);
      return { ok: true, message: `أُضيفت خانة «${created.title}» للجدول` };
    }

    default:
      return { ok: false, error: "نوع مقترح غير معروف" };
  }
}
