import "server-only";
import { getDatabase } from "@netlify/database";

/**
 * اسم الحلقة صاحبة رمز دعوة معلّم — لعرضه قبل التسجيل. بلا حماية جلسة
 * عمداً (الزائر لسه ما سجّل حسابه)، لكنه لا يكشف شيئاً حسّاساً — اسم
 * الحلقة فقط.
 */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ error: "الرمز مفقود" }, { status: 400 });

  const rows = await getDatabase().sql`SELECT name FROM halaqahs WHERE teacher_invite_code = ${code}`;
  const row = rows[0];
  if (!row) return Response.json({ error: "رمز الدعوة غير صحيح" }, { status: 404 });

  return Response.json({ halaqahName: row.name });
}
