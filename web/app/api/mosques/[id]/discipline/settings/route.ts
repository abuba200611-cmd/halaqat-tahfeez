import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { getDisciplineConfig, setDisciplineConfig } from "@/lib/discipline-db";
import { parseDisciplineConfigBody } from "@/lib/discipline";
import { logServerError } from "@/lib/dev-error-log";

/*
  A2 — إعدادات الانضباط للجامع: كل رقم في السُلّمين قابل للضبط من هنا
  (العتبات، أيام الفصل، أيام الإيقاف، التصنيفات، نمط «حاضر افتراضياً»).
  تُقرأ مدموجة فوق الافتراضيات دائماً، فغياب المفتاح كله = الافتراضيات.
*/

type RouteContext = { params: Promise<{ id: string }> };

/** الإعدادات الفعّالة (المخزونة مدموجة فوق الافتراضيات) */
export async function GET(_request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "discipline");
  if (gate) return gate;

  const config = await getDisciplineConfig(mosqueId);
  return Response.json({ config });
}

/** حفظ الإعدادات — جسم كامل أو جزئي يُدمج فوق الافتراضي بحدود صارمة */
export async function PUT(request: Request, { params }: RouteContext) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "discipline");
  if (gate) return gate;

  const body = await request.json().catch(() => null);
  const parsed = parseDisciplineConfigBody(body);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  try {
    await setDisciplineConfig(mosqueId, parsed.config);
    return Response.json({ ok: true, config: parsed.config });
  } catch (error) {
    await logServerError("mosque-discipline-settings:put", error);
    throw error;
  }
}
