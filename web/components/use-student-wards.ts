"use client";

import { useCallback, useEffect, useState } from "react";
import type { MonthlySummary } from "@/lib/monthly-report";
import type { WardLog } from "@/lib/types";

/**
 * جلب أوراد الطالب وسجله الشهري — مشترك بين لوحة الطالب الرئيسية،
 * صفحة "سجّل وردي"، وصفحة "أورادي" (STEP 58)، بدل تكرار نفس منطق
 * fetch/loading بكل صفحة على حدة.
 */
export function useStudentWards() {
  const [logs, setLogs] = useState<WardLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [months, setMonths] = useState<MonthlySummary[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(true);

  const loadLogs = useCallback(() => {
    fetch("/api/wards/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { wards?: WardLog[] } | null) => {
        if (data) setLogs(data.wards ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingLogs(false));
  }, []);

  const loadMonths = useCallback(() => {
    fetch("/api/wards/monthly")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { months?: MonthlySummary[] } | null) => {
        if (data) setMonths(data.months ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingMonths(false));
  }, []);

  const reload = useCallback(() => {
    loadLogs();
    loadMonths();
  }, [loadLogs, loadMonths]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- تحميل أولي مرة واحدة فقط، reload يُستدعى يدوياً بعد أي تعديل
  }, []);

  return { logs, loadingLogs, months, loadingMonths, reload };
}
