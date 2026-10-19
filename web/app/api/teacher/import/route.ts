import { currentTeacher, unauthorized } from "@/lib/auth";
import { guardImpersonation } from "@/lib/dev-impersonation";
import { handleImport } from "@/lib/enrollment-api";
import { importMosqueForHalaqah } from "@/lib/mosque/enrollment-db";

/*
  استيراد المعلّم لطلاب حلقته فقط: الحلقة والجامع من جلسته حصراً (لا يُقبل أي معرّف
  من العميل، وعمود «الحلقة» في الملف يُتجاهل) فلا يمكنه الإدراج بحلقة غيره.
  GET يخبر الواجهة إن كانت الميزة مفعّلة لجامع حلقته.
*/
export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();
  return Response.json({ enabled: (await importMosqueForHalaqah(teacher.halaqahId)) !== null });
}

export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const blocked = await guardImpersonation();
  if (blocked) return blocked;

  const mosqueId = await importMosqueForHalaqah(teacher.halaqahId);
  if (mosqueId === null) return Response.json({ error: "استيراد الطلاب غير مفعّل لجامع حلقتك" }, { status: 404 });

  return handleImport(request, {
    mosqueId,
    scope: { kind: "teacher", halaqahId: teacher.halaqahId },
    rateKey: `teacher:${teacher.halaqahId}`,
  });
}
