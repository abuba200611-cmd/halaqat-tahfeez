"use client";

import { canEditWard } from "@/lib/ward-ayah";
import { hifzRangeText, reviewRangeText, statusTone, STATUS_LABEL } from "@/lib/student-ward-display";
import { reviewTextWithTracks } from "@/lib/review-tracks";
import type { WardLog } from "@/lib/types";

/**
 * صفّ ورد واحد بقائمة — مشترك بين لوحة الطالب الرئيسية (آخر 5، تعديل
 * فقط) وصفحة "أورادي" الكاملة (تعديل وحذف)، STEP 58. onEdit وonDelete
 * اختياريان: تمريرهما فقط يُظهر الزرّ المقابل، وبس للأوراد القابلة
 * للتعديل (canEditWard) كما بالتصميم الأصلي.
 */
export function WardListItem({
  log,
  onEdit,
  onDelete,
}: {
  log: WardLog;
  onEdit?: (log: WardLog) => void;
  onDelete?: (log: WardLog) => void;
}) {
  const editable = canEditWard(log.status);

  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="tabular text-sm font-medium text-stone-800">{log.date}</span>
        <div className="flex shrink-0 items-center gap-2">
          {editable && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(log)}
              className="cursor-pointer text-xs font-semibold text-accent-ink hover:underline"
            >
              تعديل
            </button>
          )}
          {editable && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(log)}
              className="cursor-pointer text-xs font-semibold text-destructive hover:underline"
            >
              حذف
            </button>
          )}
          <span className={`tabular rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(log.status)}`}>
            {STATUS_LABEL[log.status]}
          </span>
        </div>
      </div>

      {log.previousAttemptId && <p className="mt-1 text-xs text-stone-400">↩ محاولة جديدة عن ورد سابق</p>}

      <div className="mt-1 space-y-0.5 text-sm text-stone-500">
        {hifzRangeText(log.hifz, log.hifzAyah) && <p>حفظ: {hifzRangeText(log.hifz, log.hifzAyah)}</p>}
        {reviewTextWithTracks(log, reviewRangeText(log)) && (
          <p>مراجعة: {reviewTextWithTracks(log, reviewRangeText(log))}</p>
        )}
        {log.note && <p className="text-stone-700">{log.note}</p>}
      </div>

      {log.status === "approved" && (
        <p className="mt-2 flex items-center gap-1 text-xs text-stone-400">🔒 اعتمده المعلّم — للتعديل تواصل مع معلّمك</p>
      )}

      {log.status === "needs_revision" && (
        <div className="mt-2 space-y-1 rounded-xl border border-destructive bg-destructive-soft/60 p-2">
          {log.reviewNote && <p className="text-sm text-destructive">ملاحظة معلّمك: «{log.reviewNote}»</p>}
          <p className="text-xs text-stone-500">أرسل محاولة جديدة من صفحة «سجّل وردي» — هذه المحاولة لا يمكن تعديلها.</p>
        </div>
      )}
    </li>
  );
}
