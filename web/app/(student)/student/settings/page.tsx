"use client";

import { useStudentLogout, useStudentSession } from "@/components/student-gate";
import { StudentPushToggle } from "@/components/student-push-toggle";
import { LogoutIcon } from "@/components/icons";

/** "الإعدادات" — التذكير اليومي وتسجيل الخروج (STEP 58)، كان زر الإشعارات مبعثراً برأس الرئيسية */
export default function StudentSettingsPage() {
  const student = useStudentSession();
  const logout = useStudentLogout();

  return (
    <div className="space-y-3">
      <h1 className="font-naskh text-xl font-bold text-slate-800">الإعدادات</h1>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">التذكير اليومي</h2>
        <StudentPushToggle />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-700">الحساب</h2>
        <p className="mb-3 text-sm text-slate-500">
          {student?.name} — {student?.halaqahName || "بلا حلقة"}
        </p>
        <button
          type="button"
          onClick={logout}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"
        >
          <LogoutIcon size={16} />
          تسجيل خروج
        </button>
      </div>
    </div>
  );
}
