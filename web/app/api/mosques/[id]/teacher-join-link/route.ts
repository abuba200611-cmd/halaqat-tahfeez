import { parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { unauthorized } from "@/lib/mosque/admin-auth";
import { canAccessMosque } from "@/lib/mosque/access";
import { getMosque, getOrCreateTeacherJoinCode, isFeatureEnabled, rotateTeacherJoinCode } from "@/lib/mosque/db";

/*
  رابط انضمام المعلّمين لجامع: GET يرجع الرابط (ويولّد الرمز كسولاً)،
  وPOST يجدّده فيبطل القديم. الرابط يفتح تطبيق المعلّم (TEACHER_APP_URL).
*/

function buildLink(code: string): string | null {
  const base = process.env.TEACHER_APP_URL?.trim().replace(/\/+$/, "");
  return base ? `${base}/join-mosque?code=${encodeURIComponent(code)}` : null;
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

function respond(code: string | null): Response {
  if (!code) return Response.json({ error: "الجامع غير موجود" }, { status: 404 });
  const link = buildLink(code);
  if (!link) return Response.json({ error: "عنوان نظام المعلّم غير مضبوط" }, { status: 503 });
  return Response.json({ code, link });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if (g instanceof Response) return g;
  return respond(await getOrCreateTeacherJoinCode(g.mosqueId));
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guard(params);
  if (g instanceof Response) return g;
  return respond(await rotateTeacherJoinCode(g.mosqueId));
}
