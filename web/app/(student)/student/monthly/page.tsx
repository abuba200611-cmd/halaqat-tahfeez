"use client";

import { MonthlyHistorySection } from "@/components/monthly-history";
import { useStudentWards } from "@/components/use-student-wards";

/** "التقرير الشهري" — صفحة مستقلة (STEP 58)، كانت قسماً داخل الرئيسية */
export default function StudentMonthlyPage() {
  const { months, loadingMonths } = useStudentWards();

  return (
    <div className="space-y-3">
      <h1 className="font-naskh text-xl font-bold text-slate-800">التقرير الشهري</h1>
      <MonthlyHistorySection months={months} loading={loadingMonths} />
    </div>
  );
}
