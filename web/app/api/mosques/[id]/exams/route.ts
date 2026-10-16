import { featureGate, parsePositiveIntParam, paramNotFound } from "@/lib/mosque/api-gate";
import { listHalaqahs } from "@/lib/mosque/db";
import {
  getExamConfig,
  listCertificates,
  listExamTypes,
  listNominations,
  listResults,
  listSessions,
  seedDefaultExamTypes,
  updateExamConfig,
  listMosqueTeachers,
  listMosqueMemberOptions,
} from "@/lib/mosque/exams-db";

const FEATURE = "exams";

/**
 * لوحة الاختبارات للإدارة — كل البيانات بنداء واحد: الإعدادات والأنواع
 * (تُبذَر افتراضياً عند أول فتح) والترشيحات والجلسات وآخر النتائج والشهادات
 * ومرشّحو اللجان (معلّمو الجامع وأعضاؤه) والحلقات.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const config = await getExamConfig(mosqueId);
  const types = await listExamTypes(mosqueId);
  const seeded = types.length > 0 ? types : await seedDefaultExamTypes(mosqueId, config);

  const [nominations, sessions, recentResults, certificates, teachers, members, halaqahs] = await Promise.all([
    listNominations(mosqueId),
    listSessions(mosqueId),
    listResults(mosqueId, 100),
    listCertificates(mosqueId),
    listMosqueTeachers(mosqueId),
    listMosqueMemberOptions(mosqueId),
    listHalaqahs(mosqueId),
  ]);

  return Response.json({
    config,
    types: seeded,
    nominations,
    sessions,
    recentResults,
    certificates,
    teachers,
    members,
    halaqahs: halaqahs.map((h) => ({ id: h.id, name: h.halaqahName })),
  });
}

/** تحديث إعدادات الأرقام (دمج فوق المخزَّن) — التصحيح عند القراءة */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, FEATURE);
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { config?: unknown };
  if (typeof body.config !== "object" || body.config === null || Array.isArray(body.config)) {
    return Response.json({ error: "config يجب أن يكون كائناً" }, { status: 400 });
  }
  const config = await updateExamConfig(mosqueId, body.config as Record<string, unknown>);
  return Response.json({ config });
}
