import { isAdmin, unauthorized } from "@/lib/mosque/admin-auth";
import { createMosque, listMosques } from "@/lib/mosque/db";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  return Response.json({ mosques: await listMosques() });
}

export async function POST(request: Request) {
  if (!(await isAdmin())) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { name?: unknown; city?: unknown };
  const name = String(body.name ?? "").trim();
  const city = String(body.city ?? "").trim();
  if (!name) return Response.json({ error: "اسم الجامع مطلوب" }, { status: 400 });

  const id = await createMosque(name, city);
  return Response.json({ ok: true, id });
}
