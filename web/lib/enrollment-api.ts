import "server-only";

import { featureGate, paramNotFound, parsePositiveIntParam } from "@/lib/mosque/api-gate";
import { currentMosqueActor } from "@/lib/mosque/actor";
import { checkRateLimit, rateLimited } from "@/lib/rate-limit";
import { AUTO_ASSIGN_KEY, IMPORT_KEY, commitImport, previewImport, type ImportScope } from "@/lib/mosque/enrollment-db";
import { importTemplateCsv } from "@/lib/student-import";
import { parseImportFile } from "@/lib/student-import-file";
import { logServerError } from "@/lib/dev-error-log";

/*
  مقدّمة مشتركة لمسارات التوزيع الآلي والاستيراد. الجامع يأتي من المسار ويُتحقّق
  منه ببوابة الميزة (مدير هذا الجامع أو المشرف العام فقط)؛ أما استيراد المعلّم
  فمعرّف حلقته وجامعه من جلسته لا من العميل. كل معرّف ابن يُقيَّد بـ mosque_id
  في طبقة البيانات فلا يصل معرّف جامع آخر.
*/

export type EnrollmentContext = { mosqueId: number };

export async function enrollmentGate(rawMosqueId: string): Promise<EnrollmentContext | Response> {
  const mosqueId = parsePositiveIntParam(rawMosqueId);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, AUTO_ASSIGN_KEY);
  if (gate) return gate;
  return { mosqueId };
}

export async function importGate(rawMosqueId: string): Promise<EnrollmentContext | Response> {
  const mosqueId = parsePositiveIntParam(rawMosqueId);
  if (mosqueId === null) return paramNotFound();
  const gate = await featureGate(mosqueId, IMPORT_KEY);
  if (gate) return gate;
  return { mosqueId };
}

/** حدّ الكتابة: ١٢٠ عملية/ساعة لكل جامع. Response عند التجاوز وإلا null */
export async function enrollmentWriteGuard(mosqueId: number): Promise<Response | null> {
  const actor = await currentMosqueActor();
  if (!(await checkRateLimit(`enrollment-write:${actor.kind}:${mosqueId}`, 120, 3600))) return rateLimited();
  return null;
}

export function templateResponse(admin: boolean): Response {
  return new Response(importTemplateCsv(admin), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="students-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}

/**
 * معاينة/تأكيد الاستيراد (multipart: file + mode=preview|commit). الخادم يقرأ الملف
 * ويتحقق منه في كل مرة — التأكيد لا يستلم أي صفوف محلَّلة من العميل. حدّ المعدّل
 * منفصل: ٦٠ معاينة و٢٠ تأكيداً بالساعة لكل نطاق.
 */
export async function handleImport(
  request: Request,
  opts: { mosqueId: number; scope: ImportScope; rateKey: string },
): Promise<Response> {
  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "طلب غير صالح" }, { status: 400 });
  const mode = form.get("mode") === "commit" ? "commit" : "preview";
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "اختر ملف .xlsx أو .csv" }, { status: 400 });

  const limit = mode === "commit" ? 20 : 60;
  if (!(await checkRateLimit(`student-import-${mode}:${opts.rateKey}`, limit, 3600))) return rateLimited();

  const parsed = await parseImportFile(file);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: parsed.status });

  try {
    if (mode === "preview") {
      const preview = await previewImport(opts.mosqueId, opts.scope, parsed.rows);
      return Response.json({ mode, ...preview });
    }
    const result = await commitImport(opts.mosqueId, opts.scope, parsed.rows);
    return Response.json({ mode, ...result });
  } catch (error) {
    await logServerError(`student-import:${mode}`, error);
    return Response.json({ error: "تعذّر تنفيذ الاستيراد — لم يُحفظ شيء، حاول مرة ثانية" }, { status: 500 });
  }
}
