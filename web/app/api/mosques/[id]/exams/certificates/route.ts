import { featureGate, parsePositiveIntParam, paramNotFound, text } from "@/lib/mosque/api-gate";
import { getExamConfig, getResult, issueCertificate } from "@/lib/mosque/exams-db";
import { achievementText, isCertificateKind } from "@/lib/mosque/exams";

/**
 * إصدار شهادة — ثلاثة أنواع:
 *   student_exam      من نتيجة منشورة ناجحة (الإنجاز يُشتق من نطاق الأجزاء).
 *   teacher_service   شهادة خدمة معلّم (اسم حر + فترة خدمة نصية اختيارية).
 *   student_enrollment تعريف طالب (اسم حر + السنة الدراسية نصاً اختيارياً).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const mosqueId = parsePositiveIntParam((await params).id);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, "exams");
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = body.kind;
  if (!isCertificateKind(kind)) {
    return Response.json({ error: "kind يجب أن يكون student_exam أو teacher_service أو student_enrollment" }, { status: 400 });
  }

  const config = await getExamConfig(mosqueId);

  if (kind === "student_exam") {
    const resultId = Number(body.resultId);
    if (!Number.isInteger(resultId) || resultId < 1) return Response.json({ error: "resultId مطلوب" }, { status: 400 });
    const result = await getResult(mosqueId, resultId);
    if (!result) return Response.json({ error: "النتيجة ليست من هذا الجامع" }, { status: 404 });
    if (!result.passed) return Response.json({ error: "الشهادات للنتائج الناجحة" }, { status: 400 });
    if (result.publishedAt === null) return Response.json({ error: "انشر النتيجة قبل إصدار شهادتها" }, { status: 400 });

    const certificate = await issueCertificate(mosqueId, config, {
      kind,
      holderName: result.studentName,
      title: text(body.title, 200) || achievementText(result.juzFrom, result.juzTo),
      resultId: result.id,
      teacherId: null,
      halaqahId: result.halaqahId,
      studentId: result.studentId,
      payload: {
        typeName: result.typeName,
        score: String(result.score),
        maxScore: String(result.maxScore),
        sessionDate: result.sessionDate,
        halaqahName: result.halaqahName,
      },
    });
    return Response.json({ certificate }, { status: 201 });
  }

  // شهادة خدمة معلّم / تعريف طالب — اسم حامل واجب، والعنوان والبيانات حرة قصيرة
  const holderName = text(body.holderName, 150);
  if (!holderName) return Response.json({ error: "اسم حامل الشهادة مطلوب" }, { status: 400 });
  const payloadSource = (typeof body.payload === "object" && body.payload !== null ? body.payload : {}) as Record<string, unknown>;
  const payload: Record<string, string> = {};
  for (const key of ["period", "academicYear", "halaqahName", "role"]) {
    if (payloadSource[key] !== undefined) payload[key] = text(payloadSource[key], 200);
  }

  const certificate = await issueCertificate(mosqueId, config, {
    kind,
    holderName,
    title: text(body.title, 200) || (kind === "teacher_service" ? "شهادة شكر وتقدير على جهوده في تحفيظ القرآن الكريم" : "تعريف بأن الطالب المذكور طالب بالجامع"),
    resultId: null,
    teacherId: kind === "teacher_service" ? ((Number(body.teacherId) || null) as number | null) : null,
    halaqahId: null,
    studentId: null,
    payload,
  });
  return Response.json({ certificate }, { status: 201 });
}
