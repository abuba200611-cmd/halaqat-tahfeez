import { currentMosqueAdmin } from "@/lib/mosque-auth";
import { listLinksForMosque } from "@/lib/association-links-db";
import { logServerError } from "@/lib/dev-error-log";

/** طلبات الربط الواردة من الجمعيات لجامع مدير الجلسة فقط (المعرّف من الجلسة) */
export async function GET() {
  const admin = await currentMosqueAdmin();
  if (!admin) return Response.json({ error: "يجب تسجيل دخول مدير الجامع" }, { status: 401 });

  try {
    return Response.json({ links: await listLinksForMosque(admin.mosqueId) });
  } catch (error) {
    await logServerError("mosque-admin:link-requests:get", error);
    return Response.json({ error: "تعذّر التحميل" }, { status: 500 });
  }
}
