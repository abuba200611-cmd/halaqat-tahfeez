"use client";

import { useCallback, useEffect, useState } from "react";
import type { WardUnit } from "@/lib/halaqah-stage";
import type { DailyPoint } from "@/lib/chart-series";
import type { MonthlySummary } from "@/lib/monthly-report";
import { DEFAULT_REVIEW_TRACK_CONFIG, parseReviewTrackConfig, type ReviewTrackConfig } from "@/lib/review-track-config";
import type { WardLog } from "@/lib/types";

/**
 * جلب أوراد الطالب وسجله الشهري — مشترك بين لوحة الطالب الرئيسية،
 * صفحة "سجّل وردي"، وصفحة "أورادي" (STEP 58)، بدل تكرار نفس منطق
 * fetch/loading بكل صفحة على حدة. يشمل إعدادات تصنيف المراجعة من جامع
 * الحلقة (الافتراضيات قبل وصولها أو لحلقة بلا جامع)، ووحدة عرض الفئة
 * (001 T022: unit من /api/wards/mine — null للحلقة بلا فئة فتبقى
 * الواجهة على النمط الحالي حرفياً، SC-005)، وسلسلة أوراد يومية آخر
 * ٣٠ يوماً (مواصفة 003) لرسم اللوحة.
 */
export function useStudentWards() {
  const [logs, setLogs] = useState<WardLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [months, setMonths] = useState<MonthlySummary[]>([]);
  const [loadingMonths, setLoadingMonths] = useState(true);
  const [reviewTrackConfig, setReviewTrackConfig] = useState<ReviewTrackConfig>(DEFAULT_REVIEW_TRACK_CONFIG);
  const [unit, setUnit] = useState<WardUnit | null>(null);
  const [wardsDaily, setWardsDaily] = useState<DailyPoint[]>([]);

  const loadLogs = useCallback(() => {
    fetch("/api/wards/mine")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { wards?: WardLog[]; wardsDaily?: DailyPoint[]; reviewTrackConfig?: ReviewTrackConfig; stage?: string | null; unit?: WardUnit } | null) => {
        if (data) {
          setLogs(data.wards ?? []);
          setWardsDaily(data.wardsDaily ?? []);
          setReviewTrackConfig(parseReviewTrackConfig(data.reviewTrackConfig));
          // بلا فئة (stage=null) لا وحدة عرض — السلوك الحالي كما هو
          setUnit(data.stage ? (data.unit ?? null) : null);
        }
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

  return { logs, loadingLogs, months, loadingMonths, reviewTrackConfig, unit, wardsDaily, reload };
}
