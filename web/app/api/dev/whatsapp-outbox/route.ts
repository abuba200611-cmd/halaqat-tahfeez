import { devConsoleGate } from "@/lib/dev-gate";
import { logDevAction } from "@/lib/dev-audit";
import { listWhatsappOutbox, resendWhatsappOutbox } from "@/lib/notify/outbox";

/*
  صادر واتساب بلوحة المطوّر (B1): آخر 200 رسالة مع فلترة بالحالة أو الجامع،
  وإعادة إرسال رسالة فاشلة (تُسجَّل بسجل التدقيق كأي إجراء حساس).
*/

const STATUSES = new Set(["queued", "sent", "failed", "skipped"]);

export async function GET(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const params = new URL(request.url).searchParams;
  const statusParam = params.get("status") ?? "";
  const mosqueParam = params.get("mosque") ?? "";
  const mosqueId = /^[0-9]+$/.test(mosqueParam) ? Number(mosqueParam) : undefined;

  const rows = await listWhatsappOutbox({
    status: STATUSES.has(statusParam) ? statusParam : undefined,
    mosqueId: Number.isSafeInteger(mosqueId) && (mosqueId as number) > 0 ? mosqueId : undefined,
    limit: 200,
  });
  return Response.json({ rows });
}

export async function POST(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 1) return Response.json({ error: "id مطلوب" }, { status: 400 });

  const outcome = await resendWhatsappOutbox(id);
  if (outcome === "not_found") return Response.json({ error: "الرسالة غير موجودة" }, { status: 404 });
  if (outcome === "not_failed") return Response.json({ error: "إعادة الإرسال للرسائل الفاشلة فقط" }, { status: 400 });

  await logDevAction("whatsapp_resend", "outbox", id, { status: outcome });
  return Response.json({ status: outcome });
}
