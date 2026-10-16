import { clientIp } from "@/lib/client-ip";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { findCertificateForVerification, getExamConfig } from "@/lib/mosque/exams-db";
import { CERTIFICATE_KIND_LABELS } from "@/lib/mosque/exams";

/*
  تحقق عام من شهادة برمزها — بلا جلسة. الرد يحمل أقل ما يثبت صلاحيتها:
  نوع الشهادة واسم الجامع واسم الحامل والإنجاز وتاريخ الإصدار وصلاحيتها —
  لا درجات ولا معرّفات داخلية. حدّان للمعدل: حدّ خشن ثابت للرموز المجهولة،
  وحدّ إعدادات الجامع (verifyRateLimitPerMinute) بعد معرفة شهادته.
*/

const CODE_PATTERN = /^[A-Za-z0-9-]{4,40}$/;

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const NOT_FOUND = Response.json({ error: "رمز التحقق غير صحيح" }, { status: 404 });
  if (!CODE_PATTERN.test(code)) return NOT_FOUND;

  const ip = clientIp(request);
  if (!(await checkRateLimit(`verify-exam-unknown:${ip}`, 120, 60))) return rateLimited();

  const certificate = await findCertificateForVerification(code);
  if (!certificate) return NOT_FOUND;

  const config = await getExamConfig(certificate.mosqueId);
  if (!(await checkRateLimit(`verify-exam:${certificate.mosqueId}:${ip}`, config.verifyRateLimitPerMinute, 60))) {
    return rateLimited();
  }

  return Response.json({
    valid: certificate.valid,
    kind: certificate.kind,
    kindLabel: CERTIFICATE_KIND_LABELS[certificate.kind],
    mosqueName: certificate.mosqueName,
    holderName: certificate.holderName,
    title: certificate.title,
    issuedAt: certificate.issuedAt,
  });
}
