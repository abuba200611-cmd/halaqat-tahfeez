import { parsePositiveIntParam } from "@/lib/mosque/api-gate";
import { logServerError } from "@/lib/dev-error-log";
import { parseGenerateBody } from "@/lib/fees";
import { generateDues, listFees, listPlans } from "@/lib/fees-db";
import { feesGate, feesWriteGuard } from "@/lib/fees-api";

/*
  الرسوم والاشتراكات (سجل يدوي بلا بوابة دفع): GET = الخطط + المستحقات
  بمرشّحات (?halaqah=&status=&period=) + الإجماليات؛ POST = توليد مستحقات
  خطة لفترة عبر حلقات مختارة (متكرر التشغيل: لا يكرّر المولَّد سابقاً).
*/

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const ctx = await feesGate((await params).id);
  if (ctx instanceof Response) return ctx;

  try {
    const query = new URL(request.url).searchParams;
    const [plans, listing] = await Promise.all([
      listPlans(ctx.mosqueId),
      listFees(ctx.mosqueId, {
        halaqahId: parsePositiveIntParam(query.get("halaqah") ?? undefined),
        status: query.get("status"),
        period: query.get("period"),
      }),
    ]);
    return Response.json({ plans, fees: listing.fees, totals: listing.totals });
  } catch (error) {
    await logServerError("mosque-fees:get", error);
    throw error;
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const ctx = await feesGate((await params).id);
  if (ctx instanceof Response) return ctx;

  try {
    const parsed = parseGenerateBody(await request.json().catch(() => ({})));
    if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

    const guard = await feesWriteGuard(ctx.mosqueId);
    if (guard instanceof Response) return guard;

    const result = await generateDues({ mosqueId: ctx.mosqueId, ...parsed.value });
    if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
    return Response.json({ ok: true, eligible: result.eligible, created: result.created, skipped: result.skipped });
  } catch (error) {
    await logServerError("mosque-fees:generate", error);
    throw error;
  }
}
