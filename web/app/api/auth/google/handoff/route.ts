import { readGoogleHandoff } from "@/lib/google-handoff";

/** يعرض لواجهة /signup بيانات هوية جوجل من التسليم الموقّع (للتعبئة المسبقة فقط) */
export async function GET() {
  const handoff = await readGoogleHandoff();
  if (!handoff) return Response.json({ error: "انتهت صلاحية التحقق من جوجل" }, { status: 404 });
  return Response.json({ email: handoff.email, name: handoff.name });
}
