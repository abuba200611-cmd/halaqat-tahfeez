import { currentTeacher, unauthorized } from "@/lib/auth";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { getHalaqah, isFeatureEnabled } from "@/lib/mosque/db";
import { text } from "@/lib/mosque/api-gate";
import {
  createNomination,
  findStudentInHalaqah,
  getExamConfig,
  getExamType,
  listActiveExamTypes,
  listExamTypes,
  listNominationsByHalaqah,
  listScoringSessionsForTeacher,
  seedDefaultExamTypes,
} from "@/lib/mosque/exams-db";
import { validateJuzRange } from "@/lib/mosque/exams";

/*
  الاختبارات لواجهة المعلّم — جامعه هو جامع حلقته (halaqahs.mosque_id)،
  فالمعلم بلا جامع أو بجامع معطّلة ميزته يرى 404، وطلابه المرشَّحون طلاب
  حلقته حصراً.
*/

async function teacherMosqueId(halaqahId: number): Promise<number | null> {
  const halaqah = await getHalaqah(halaqahId);
  return halaqah?.mosqueId ?? null;
}

/** أنواع جامعي + ترشيحات حلقتي + جلساتي كممتحن */
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const mosqueId = await teacherMosqueId(teacher.halaqahId);
  if (mosqueId === null || !(await isFeatureEnabled(mosqueId, "exams"))) {
    return Response.json({ error: "الاختبارات غير مفعّلة لجامع حلقتك" }, { status: 404 });
  }

  const config = await getExamConfig(mosqueId);
  const types = await listExamTypes(mosqueId);
  const activeTypes = types.length > 0 ? await listActiveExamTypes(mosqueId) : await seedDefaultExamTypes(mosqueId, config);

  const [nominations, sessions] = await Promise.all([
    listNominationsByHalaqah(teacher.halaqahId),
    listScoringSessionsForTeacher(teacher.id),
  ]);
  return Response.json({ types: activeTypes, nominations, sessions });
}

/** ترشيح طالب من حلقتي — النوع من جامعنا والنطاق بطول النوع */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const mosqueId = await teacherMosqueId(teacher.halaqahId);
  if (mosqueId === null || !(await isFeatureEnabled(mosqueId, "exams"))) {
    return Response.json({ error: "الاختبارات غير مفعّلة لجامع حلقتك" }, { status: 404 });
  }

  const config = await getExamConfig(mosqueId);
  if (!(await checkRateLimit(`exam-nominate:${teacher.id}`, config.nominationsPerHourPerTeacher, 3600))) {
    return rateLimited();
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const typeId = Number(body.typeId);
  if (!Number.isInteger(typeId) || typeId < 1) return Response.json({ error: "نوع الاختبار مطلوب" }, { status: 400 });

  const type = await getExamType(mosqueId, typeId);
  if (!type || !type.active) return Response.json({ error: "نوع الاختبار غير موجود" }, { status: 404 });

  const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
  if (!studentId) return Response.json({ error: "الطالب مطلوب" }, { status: 400 });
  const student = await findStudentInHalaqah(teacher.halaqahId, studentId);
  if (!student) return Response.json({ error: "الطالب ليس من حلقتك" }, { status: 404 });

  const range = validateJuzRange(body.juzFrom, body.juzTo, type.juzCount);
  if ("error" in range) return Response.json({ error: range.error }, { status: 400 });

  const outcome = await createNomination(mosqueId, {
    typeId,
    halaqahId: teacher.halaqahId,
    studentId,
    juzFrom: range.from,
    juzTo: range.to,
    nominatedBy: teacher.id,
    note: text(body.note, 300),
  });
  if (outcome === "duplicate") return Response.json({ error: "هذا الترشيح قائم أصلاً بانتظار الاختبار" }, { status: 409 });
  if (outcome === "invalid") return Response.json({ error: "تعذّر إنشاء الترشيح" }, { status: 400 });
  return Response.json({ nomination: outcome }, { status: 201 });
}
