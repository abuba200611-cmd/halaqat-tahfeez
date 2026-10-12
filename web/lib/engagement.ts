/*
  STEP 66 — درجة تفاعل الطالب (٠–١٠٠) لمقاييس نظام إدارة الجامع. دالة
  صرفة بلا I/O، تُركَّب مدخلاتها في lib/metrics.ts من بيانات النطاق
  المطلوب، فتبقى الصيغة قابلة للاختبار والضبط بمعزل عن قاعدة البيانات.

  الصيغة الموزونة: ٣٥٪ نسبة الحضور + ٣٠٪ انتظام الأوراد (أيام بها ورد ÷
  الأيام المحسوبة) + ٢٠٪ تقدّم الخطة + ١٥٪ متوسط التلاوة (÷١٠). القيم
  تُطبَّع كلٌّ على مقياسها ثم تُقصّ لما بين ٠ و١، فلا مكافأة مضاعفة فوق
  الاكتمال.

  المكوّن المفقود (لا خطة، لا تلاوة مقيَّمة، لا أيام محسوبة) لا يُعدّ
  صفراً — يُعاد توزيع وزنه على المكوّنات المتاحة الباقية (القسمة على
  مجموع أوزانها)، لأن غياب الخطة غالباً تقصير إداري لا من الطالب. لو
  غابت كل المكوّنات فالدرجة ٠.
*/

/** أوزان المكوّنات — مجموعها ١ (يُختبر)، والتعديل من هنا فقط */
export const ENGAGEMENT_WEIGHTS = {
  attendance: 0.35,
  wardConsistency: 0.3,
  planProgress: 0.2,
  recitation: 0.15,
} as const;

export type EngagementInput = {
  /** نسبة الحضور ٠–١٠٠ (حاضر+متأخر ÷ الأيام المحسوبة)، أو null بلا أيام محسوبة */
  attendanceRate: number | null;
  /** انتظام الأوراد ٠–١ (أيام بها ورد ÷ الأيام المحسوبة)، أو null بلا أيام محسوبة */
  wardConsistency: number | null;
  /** تقدّم الخطة ٠–١٠٠ (فوق ١٠٠ يُقصّ)، أو null بلا خطة/مستهدف */
  planProgressPct: number | null;
  /** متوسط درجات التلاوة ٠–١٠، أو null بلا تلاوة مقيَّمة */
  recitationAvg: number | null;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** درجة التفاعل ٠–١٠٠ — انظر الصيغة ومعالجة المكوّن المفقود أعلاه */
export function engagementScore(input: EngagementInput): number {
  const components: { weight: number; value: number | null }[] = [
    {
      weight: ENGAGEMENT_WEIGHTS.attendance,
      value: input.attendanceRate === null ? null : clamp01(input.attendanceRate / 100),
    },
    {
      weight: ENGAGEMENT_WEIGHTS.wardConsistency,
      value: input.wardConsistency === null ? null : clamp01(input.wardConsistency),
    },
    {
      weight: ENGAGEMENT_WEIGHTS.planProgress,
      value: input.planProgressPct === null ? null : clamp01(input.planProgressPct / 100),
    },
    {
      weight: ENGAGEMENT_WEIGHTS.recitation,
      value: input.recitationAvg === null ? null : clamp01(input.recitationAvg / 10),
    },
  ];

  let earned = 0;
  let weightAvailable = 0;
  for (const c of components) {
    if (c.value === null) continue;
    earned += c.weight * c.value;
    weightAvailable += c.weight;
  }
  if (weightAvailable === 0) return 0;
  return Math.round((earned / weightAvailable) * 100);
}
