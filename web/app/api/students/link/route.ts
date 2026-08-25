import { currentTeacher, unauthorized } from "@/lib/auth";
import {
  applyLinkSummary,
  getStudentById,
  getStudentLink,
  listStudentLinkSummaries,
  listStudentLinks,
  saveStudentLink,
} from "@/lib/db";

/** عنوان نظام تسجيل الورد المستقل (tasjeel-tullab) */
const LINK_API_URL = process.env.LINK_STUDENT_API_URL ?? "http://localhost:3100";

type RemoteSummary = {
  name: string;
  latestHifz: { from: number; to: number } | null;
  latestHifzDate: string | null;
  latestReview: { from: number; to: number } | null;
  latestReviewDate: string | null;
  lastWardDate: string | null;
};

/** يجلب ملخّص طالب من نظام تسجيل الورد، أو يرمي خطأ برسالة عربية واضحة */
async function fetchRemoteSummary(username: string): Promise<RemoteSummary> {
  const secret = process.env.LINK_SECRET;
  if (!secret) {
    throw new Error(
      "لم يُضبط LINK_SECRET في إعدادات هذا النظام — راجع دليل الربط بين النظامين",
    );
  }

  let res: Response;
  try {
    res = await fetch(
      `${LINK_API_URL}/api/link/summary?username=${encodeURIComponent(username)}`,
      { headers: { "x-link-secret": secret }, cache: "no-store" },
    );
  } catch {
    throw new Error(
      `تعذّر الاتصال بنظام تسجيل الطلاب على ${LINK_API_URL} — تأكد أنه يعمل`,
    );
  }

  const data = (await res.json().catch(() => ({}))) as { summary?: RemoteSummary; error?: string };
  if (!res.ok || !data.summary) {
    throw new Error(data.error ?? "تعذّر جلب بيانات الطالب");
  }
  return data.summary;
}

/** ملخّص مقروء يُحفظ للعرض في صفحة الطلاب، مثل: "حفظ حتى ٤٥ · مراجعة ١–٢١ (٢٦-٠٧)" */
function describeSummary(summary: RemoteSummary): string {
  const parts: string[] = [];
  if (summary.latestHifz) parts.push(`حفظ حتى ${summary.latestHifz.to}`);
  if (summary.latestReview) {
    parts.push(`مراجعة ${summary.latestReview.from}–${summary.latestReview.to}`);
  }
  if (parts.length === 0) return "لا يوجد ورد مسجّل بعد";
  return parts.join(" · ");
}

export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return Response.json({
    links: await listStudentLinks(teacher.halaqahId),
    summaries: await listStudentLinkSummaries(teacher.halaqahId),
  });
}

/** يحفظ (أو يعيد استخدام) رمز الربط، ويسحب أحدث ملخّص، ويطبّقه على الطالب */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as {
    studentId?: unknown;
    linkUsername?: unknown;
  };
  const studentId = String(body.studentId ?? "").trim();
  if (!studentId) {
    return Response.json({ error: "معرّف الطالب مفقود" }, { status: 400 });
  }
  if (!(await getStudentById(teacher.halaqahId, studentId))) {
    return Response.json({ error: "الطالب غير موجود" }, { status: 404 });
  }

  // أول مرة يُرسل اسم المستخدم من النموذج؛ لإعادة السحب لاحقاً نستخدم المحفوظ
  let linkUsername = String(body.linkUsername ?? "").trim();
  if (!linkUsername) {
    const existing = await getStudentLink(teacher.halaqahId, studentId);
    if (!existing) {
      return Response.json({ error: "أدخل اسم مستخدم الطالب في نظام تسجيل الورد أولاً" }, { status: 400 });
    }
    linkUsername = existing.linkUsername;
  }

  try {
    const summary = await fetchRemoteSummary(linkUsername);
    const label = describeSummary(summary);
    await saveStudentLink(teacher.halaqahId, studentId, linkUsername, label);
    const student = await applyLinkSummary(teacher.halaqahId, studentId, {
      latestHifz: summary.latestHifz,
      latestReview: summary.latestReview,
    });
    return Response.json({ ok: true, linkUsername, summaryLabel: label, student });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر السحب" },
      { status: 502 },
    );
  }
}
