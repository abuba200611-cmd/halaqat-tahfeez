import { currentTeacher, unauthorized } from "@/lib/auth";
import { halaqahInviteCode } from "@/lib/db";
import { fetchMosqueInfo, joinMosque } from "@/lib/mosque-app";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

const MAX_PER_HOUR = 10;
const WINDOW_SECONDS = 60 * 60;

const SUPERVISOR_ONLY = { error: "اطلب من مشرف الحلقة" };

/**
 * معاينة صفحة /join-mosque: دور المعلّم + اسم حلقته + الجامع صاحب الرمز
 * (يُجلب من خادم الجامع هنا، فلا يظهر السرّ ولا عنوانه للمتصفح). المساعد
 * يرى دوره فقط بلا نداء للجامع.
 */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const base = { role: teacher.role, halaqahName: teacher.halaqahName };
  if (teacher.role !== "supervisor") return Response.json(base);

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "رابط الانضمام ناقص" }, { status: 400 });

  const info = await fetchMosqueInfo(code);
  if (info === "invalid") return Response.json({ error: "رابط الانضمام غير صحيح" }, { status: 404 });
  if (!info) return Response.json({ error: "نظام الجامع غير متاح حالياً، حاول لاحقاً" }, { status: 502 });

  return Response.json({ ...base, mosqueName: info.mosqueName, city: info.city });
}

/** انضمام حلقة المشرف لجامع الرمز — برمز دعوة طلاب الحلقة نفسه الذي كان يلصقه المدير يدوياً */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.role !== "supervisor") return Response.json(SUPERVISOR_ONLY, { status: 403 });

  if (!(await checkRateLimit(`mosque-join:${teacher.id}`, MAX_PER_HOUR, WINDOW_SECONDS))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = String(body.code ?? "").trim();
  if (!code) return Response.json({ error: "رابط الانضمام ناقص" }, { status: 400 });

  const result = await joinMosque({
    code,
    halaqahInviteCode: await halaqahInviteCode(teacher.halaqahId),
    halaqahName: teacher.halaqahName,
    teacherName: teacher.teacherName,
  });
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status === 404 ? 404 : result.status === 409 ? 409 : 502 });
  }

  return Response.json({ ok: true, alreadyJoined: result.alreadyJoined, mosqueName: result.mosqueName });
}
