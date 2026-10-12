import { currentTeacher, unauthorized } from "@/lib/auth";
import { findMosqueByTeacherJoinCode, joinHalaqahToMosqueByCode } from "@/lib/mosque/db";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";

const MAX_PER_HOUR = 10;
const WINDOW_SECONDS = 60 * 60;

const SUPERVISOR_ONLY = { error: "اطلب من مشرف الحلقة" };

/**
 * معاينة صفحة /join-mosque: دور المعلّم + اسم حلقته + الجامع صاحب الرمز
 * (استعلام مباشر لقاعدة الجامع نفسها). المساعد يرى دوره فقط.
 */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const base = { role: teacher.role, halaqahName: teacher.halaqahName };
  if (teacher.role !== "supervisor") return Response.json(base);

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "رابط الانضمام ناقص" }, { status: 400 });

  const mosque = await findMosqueByTeacherJoinCode(code);
  if (!mosque) return Response.json({ error: "رابط الانضمام غير صحيح" }, { status: 404 });

  return Response.json({ ...base, mosqueName: mosque.name, city: mosque.city });
}

/** انضمام حلقة المشرف لجامع الرمز — يضبط halaqahs.mosque_id مباشرة (بلا رمز دعوة طلاب ولا نداء خارجي) */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  if (teacher.role !== "supervisor") return Response.json(SUPERVISOR_ONLY, { status: 403 });

  if (!(await checkRateLimit(`mosque-join:${teacher.id}`, MAX_PER_HOUR, WINDOW_SECONDS))) return rateLimited();

  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const code = String(body.code ?? "").trim();
  if (!code) return Response.json({ error: "رابط الانضمام ناقص" }, { status: 400 });

  const result = await joinHalaqahToMosqueByCode(teacher.halaqahId, code);
  if (!result.ok) {
    if (result.reason === "invalid") return Response.json({ error: "رابط الانضمام غير صحيح" }, { status: 404 });
    if (result.reason === "disabled") return Response.json({ error: "الحلقات غير مفعّلة لهذا الجامع" }, { status: 404 });
    return Response.json({ error: "هذي الحلقة مضافة أصلاً لجامع آخر" }, { status: 409 });
  }

  return Response.json({ ok: true, alreadyJoined: result.alreadyJoined, mosqueName: result.mosqueName });
}
