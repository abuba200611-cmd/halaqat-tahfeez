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
      <h1 className="font-display text-xl font-bold text-stone-800">الإعدادات</h1>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-stone-700">التذكير اليومي</h2>
        <StudentPushToggle />
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-stone-700">الحساب</h2>
        <p className="mb-3 text-sm text-stone-500">
          {student?.name} — {student?.halaqahName || "بلا حلقة"}
        </p>
        <button
          type="button"
          onClick={logout}
          className="flex cursor-pointer items-center gap-2 rounded-xl border border-destructive bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive-soft"
        >
          <LogoutIcon size={16} />
          تسجيل خروج
        </button>
      </div>
    </div>
  );
}
