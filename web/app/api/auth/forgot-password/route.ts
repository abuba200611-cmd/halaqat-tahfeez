import { clientIp } from "@/lib/client-ip";
import { requestResetCode } from "@/lib/reset-code";
import { realResetDeps } from "@/lib/reset-code-deps";

/** يرسل رمز استرجاع من ٦ أرقام للبريد — الجواب واحد دائماً (لا كشف لوجود الحساب) */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  const result = await requestResetCode(body.email, clientIp(request), realResetDeps);
  return Response.json(result.body, { status: result.status });
}
