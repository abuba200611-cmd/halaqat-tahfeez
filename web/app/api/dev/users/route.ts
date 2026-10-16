import { devConsoleGate } from "@/lib/dev-gate";
import { searchDevUsers } from "@/lib/dev-db";

const MIN_QUERY = 2;

/** بحث موحّد عبر المعلمين/الطلاب/أولياء الأمور/مدراء الجوامع — أدمن فقط */
export async function GET(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY) {
    return Response.json({ users: [], hint: `اكتب ${MIN_QUERY} محارف على الأقل` });
  }
  return Response.json({ users: await searchDevUsers(q) });
}
