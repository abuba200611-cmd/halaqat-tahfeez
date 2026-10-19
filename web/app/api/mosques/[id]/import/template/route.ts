import { importGate, templateResponse } from "@/lib/enrollment-api";

/** قالب CSV لاستيراد الجامع (بعمود الحلقة) */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await importGate((await params).id);
  if (ctx instanceof Response) return ctx;
  return templateResponse(true);
}
