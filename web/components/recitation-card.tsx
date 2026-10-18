import { formatDuration, formatRecitationRange, recitationAudioUrl, type RecitationView } from "@/lib/recitations";

/** مشغّل الصوت — المسار يحرسه الخادم بالجلسة؛ preload="none" كي لا تُحمَّل البايتات قبل الضغط على التشغيل */
export function RecitationPlayer({ id }: { id: number }) {
  return <audio controls preload="none" src={recitationAudioUrl(id)} className="h-10 w-full" />;
}

export function formatRecitationDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ar", { day: "numeric", month: "short" });
}

/** بطاقة تلاوة للقراءة فقط (الطالب وولي الأمر): النطاق والحالة والدرجة وملاحظة المعلّم والتشغيل */
export function RecitationCard({ item }: { item: RecitationView }) {
  const reviewed = item.status === "reviewed";
  return (
    <li className="rounded-2xl border border-stone-200 bg-white p-3.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-stone-700">{formatRecitationRange(item)}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            reviewed ? "bg-success-soft text-success" : "bg-accent-soft text-accent-ink"
          }`}
        >
          {reviewed ? "تم التقييم" : "بانتظار المعلّم"}
        </span>
      </div>
      <p className="tabular mb-2 text-xs text-stone-500">
        {formatRecitationDate(item.createdAt)} · {formatDuration(item.durationSec)}
      </p>
      <RecitationPlayer id={item.id} />
      {reviewed && item.score !== null && (
        <p className="tabular mt-2 text-sm font-bold text-success">الدرجة: {item.score} / 10</p>
      )}
      {reviewed && item.teacherNote && <p className="mt-1 text-sm text-stone-600">{item.teacherNote}</p>}
    </li>
  );
}
