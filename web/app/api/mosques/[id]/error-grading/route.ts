import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { getErrorGradingConfig, setErrorGradingConfig } from "@/lib/error-grading-db";
import { ERROR_GRADING_FEATURE_KEY, parseErrorGradingConfig } from "@/lib/error-grading";
import { logServerError } from "@/lib/dev-error-log";

/*
  إعدادات تقييم الورد بنقاط الأخطاء لجامع: أنواع الأخطاء وخصوماتها ودرجة
  الأساس وحدود التقدير. البوابة المشتركة تحصر الوصول بمدير الجامع نفسه
  (canAccessMosque) أو المشرف العام، وبالميزة المفعّلة. تُقرأ دائماً مدموجة
  فوق الافتراضيات؛ والكتابة ترفض أي إعداد غير صالح كاملاً (لا تصحيح صامت).
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, ERROR_GRADING_FEATURE_KEY);
  if (gate) return gate;

  return Response.json({ config: await getErrorGradingConfig(mosqueId) });
}

export async function PUT(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, ERROR_GRADING_FEATURE_KEY);
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  const parsed = parseErrorGradingConfig(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    await setErrorGradingConfig(mosqueId, parsed.value);
    return Response.json({ ok: true, config: parsed.value });
  } catch (error) {
    await logServerError("mosque-error-grading:put", error);
    throw error;
  }
}
