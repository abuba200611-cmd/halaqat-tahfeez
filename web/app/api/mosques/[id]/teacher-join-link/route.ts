import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque, getOrCreateTeacherJoinCode, isFeatureEnabled, rotateTeacherJoinCode } from "@/lib/mosque/db";

/*
  رابط انضمام المعلّمين لجامع: GET يرجع الرابط (ويولّد الرمز كسولاً)،
  وPOST يجدّده فيبطل القديم. الرابط يفتح صفحة /join-mosque بالتطبيق نفسه (أصل الطلب الحالي).
*/

function buildLink(request: Request, code: string): string {
  return `${new URL(request.url).origin}/join-mosque?code=${encodeURIComponent(code)}`;
}

async function guard(params: Promise<{ id: string }>): Promise<{ mosqueId: number } | Response> {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  if (!(await canAccessMosque(mosqueId))) return unauthorized();
  if (!(await getMosque(mosqueId))) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  if (!(await isFeatureEnabled(mosqueId, "halaqat"))) {
    return Response.json({ error: "الحلقات غير مفعّلة لهذا الجامع" }, { status: 404 });
  }
  return { mosqueId };
}

function respond(request: Request, code: string | null): Response {
  if (!code) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  return Response.json({ code, link: buildLink(request, code) });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if (g instanceof Response) return g;
  return respond(request, await getOrCreateTeacherJoinCode(g.mosqueId));
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if (g instanceof Response) return g;
  return respond(request, await rotateTeacherJoinCode(g.mosqueId));
}
