import { devConsoleGate } from "@/lib/dev-gate";
import { logDevAction } from "@/lib/dev-audit";
import {
  listNativeStudentSuggestions,
  listReports,
  listSuggestions,
  setReportStatus,
  setStudentSuggestionStatus,
  setTeacherSuggestionStatus,
  type ReportStatus,
} from "@/lib/db";

/*
  قسم «البلاغات» باللوحة: كل بلاغات/اقتراحات كل الأدوار (معلّم من
  suggestions، طالب من student_suggestions، ولي أمر ومدير جامع من
  reports) في قائمة واحدة بفلترين (الدور، الحالة)، وتغيير الحالة
  مسجَّل في سجل التدقيق. المفتاح المركّب "source:id" يميّز الصف عبر
  الجداول الثلاثة (كل معرّف فريد داخل جدوله فقط).
*/

export type ReportSource = "teacher" | "student" | "parent" | "mosque_admin";

const SOURCES: ReportSource[] = ["teacher", "student", "parent", "mosque_admin"];
const STATUSES: ReportStatus[] = ["new", "seen", "done"];

export type ConsoleReport = {
  key: string;
  source: ReportSource;
  senderLabel: string;
  message: string;
  type: "suggestion" | "problem";
  status: ReportStatus;
  createdAt: string;
  attachments: { id: number; sizeBytes: number }[];
};

export async function GET(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const params = new URL(request.url).searchParams;
  const source = params.get("role") as ReportSource | null;
  const status = params.get("status") as ReportStatus | null;
  if (source && !SOURCES.includes(source)) return Response.json({ error: "دور غير معروف" }, { status: 400 });
  if (status && !STATUSES.includes(status)) return Response.json({ error: "حالة غير معروفة" }, { status: 400 });

  const [teacherReports, studentReports, otherReports] = await Promise.all([
    listSuggestions(),
    listNativeStudentSuggestions(),
    listReports(),
  ]);

  const merged: ConsoleReport[] = [
    ...teacherReports.map((r) => ({ ...strip(r), key: `teacher:${r.id}`, source: "teacher" as const })),
    ...studentReports.map((r) => ({ ...strip(r), key: `student:${r.id}`, source: "student" as const })),
    ...otherReports.map((r) => ({
      ...strip(r),
      key: `${r.reporterKind}:${r.id}`,
      source: r.reporterKind,
    })),
  ]
    .filter((r) => !source || r.source === source)
    .filter((r) => !status || r.status === status)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return Response.json({ reports: merged });
}

function strip(r: {
  senderLabel: string;
  message: string;
  type: "suggestion" | "problem";
  status: ReportStatus;
  createdAt: string;
  attachments: { id: number; sizeBytes: number }[];
}) {
  return {
    senderLabel: r.senderLabel,
    message: r.message,
    type: r.type,
    status: r.status,
    createdAt: r.createdAt,
    attachments: r.attachments,
  };
}

/** تغيير حالة بلاغ — يفكّ المفتاح المركّب ويحدّث جدوله، مسجَّلاً بالتدقيق */
export async function POST(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as { key?: unknown; status?: unknown };
  const key = String(body.key ?? "");
  const status = body.status as ReportStatus;
  if (!STATUSES.includes(status)) return Response.json({ error: "حالة غير معروفة" }, { status: 400 });

  const [sourcePart, idPart] = key.split(":");
  const id = Number(idPart);
  if (!SOURCES.includes(sourcePart as ReportSource) || !Number.isInteger(id)) {
    return Response.json({ error: "بلاغ غير معروف" }, { status: 400 });
  }

  const source = sourcePart as ReportSource;
  const updated =
    source === "teacher"
      ? await setTeacherSuggestionStatus(id, status)
      : source === "student"
        ? await setStudentSuggestionStatus(id, status)
        : await setReportStatus(id, status);
  if (!updated) return Response.json({ error: "البلاغ غير موجود" }, { status: 404 });

  await logDevAction("report_status", source, id, { to: status });
  return Response.json({ ok: true });
}
