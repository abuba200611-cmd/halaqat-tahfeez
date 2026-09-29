"use client";

import { useRouter } from "next/navigation";
import { Empty } from "@/components/ui";
import { WardListItem } from "@/components/ward-list";
import { useStudentWards } from "@/components/use-student-wards";
import type { WardLog } from "@/lib/types";

/** "أورادي" — كل أوراد الطالب (STEP 58)، التعديل ينقل لصفحة "سجّل وردي" مع تعبئة النموذج تلقائياً */
export default function StudentWardsPage() {
  const router = useRouter();
  const { logs, loadingLogs, reload } = useStudentWards();

  function editLog(log: WardLog) {
    router.push(`/student/log?edit=${log.id}`);
  }

  async function deleteLog(log: WardLog) {
    if (!confirm(`متأكد تحذف ورد يوم ${log.date}؟`)) return;
    try {
      const res = await fetch("/api/wards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: log.id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        alert(data.error ?? "تعذّر حذف الورد");
        return;
      }
      reload();
    } catch {
      alert("تعذّر الاتصال بالخادم");
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="font-naskh text-xl font-bold text-slate-800">أورادي</h1>
      {loadingLogs ? (
        <p className="text-sm text-slate-400">جارٍ التحميل…</p>
      ) : logs.length === 0 ? (
        <Empty title="لم ترسل أي ورد بعد." />
      ) : (
        <ul className="space-y-2">
          {logs.map((log) => (
            <WardListItem key={log.id} log={log} onEdit={editLog} onDelete={deleteLog} />
          ))}
        </ul>
      )}
    </div>
  );
}
