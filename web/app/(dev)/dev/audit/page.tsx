"use client";

import { Card } from "@/components/ui";
import { useApi } from "@/components/mosque/use-api";

type Entry = {
  id: number;
  at: string;
  action: string;
  targetKind: string;
  targetId: string;
  details: Record<string, unknown>;
};

const ACTION_LABEL: Record<string, string> = {
  impersonate_start: "بدء «عرض كـ»",
  impersonate_end: "إنهاء «عرض كـ»",
  feature_toggle: "تبديل ميزة",
  teacher_deactivate: "إيقاف معلّم",
  teacher_reactivate: "تفعيل معلّم",
  assistant_deactivate: "إيقاف مساعد",
  assistant_reactivate: "تفعيل مساعد",
  revoke_sessions: "إبطال الجلسات",
  unlink_parent: "فكّ ربط ولي أمر",
  admin_account_change: "تغيير حساب مدير جامع",
  whatsapp_resend: "إعادة إرسال واتساب",
  "mosque_request.approve": "قبول طلب تسجيل جامع",
  "mosque_request.reject": "رفض طلب تسجيل جامع",
};

const TARGET_LABEL: Record<string, string> = {
  teacher: "معلّم",
  student: "طالب",
  parent: "ولي أمر",
  mosque: "جامع",
  mosque_admin: "مدير جامع",
  outbox: "صادر واتساب",
  mosque_request: "طلب تسجيل جامع",
};

export default function DevAuditPage() {
  const { data, loading, status } = useApi<{ entries: Entry[] }>("/api/dev/audit");
  const entries = data?.entries ?? null;

  if (loading) return <Card className="p-4 text-sm text-muted-foreground">جارٍ التحميل…</Card>;
  if (!entries) {
    return (
      <Card className="p-4 text-sm text-destructive">
        {status === 401 ? "الجلسة انتهت — سجّل الدخول من جديد." : "تعذّر التحميل."}
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">سجل التدقيق</h1>
        <p className="text-sm text-muted-foreground">آخر ٢٠٠ إجراء حساس — الأحدث أولاً.</p>
      </div>

      {entries.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">السجل فارغ بعد.</Card>
      ) : (
        <Card className="p-2">
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{ACTION_LABEL[entry.action] ?? entry.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {TARGET_LABEL[entry.targetKind] ?? entry.targetKind} #{entry.targetId}
                  </span>
                  <span className="tabular ms-auto text-xs text-muted-foreground">
                    {entry.at.slice(0, 16).replace("T", " ")}
                  </span>
                </div>
                {Object.keys(entry.details).length > 0 && (
                  <p className="mt-1 font-mono text-xs text-muted-foreground" dir="ltr">
                    {JSON.stringify(entry.details)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
