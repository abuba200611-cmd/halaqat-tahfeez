import { authenticateV1, badRequest, decodeCursor, encodeCursor, listResponse, parseLimit } from "@/lib/api-v1";
import { listStudentsV1 } from "@/lib/api-v1-db";

/** GET /api/v1/students — طلاب جامع المفتاح غير المحذوفين (نطاق students:read) */
export async function GET(request: Request) {
  const auth = await authenticateV1(request, "students:read");
  if (auth instanceof Response) return auth;

  const query = new URL(request.url).searchParams;
  const limit = parseLimit(query.get("limit"));
  if (limit === null) return badRequest("limit بين 1 و200");
  const cursor = decodeCursor(query.get("cursor"));
  if (
    cursor === "invalid" ||
    (cursor && (cursor.length !== 2 || typeof cursor[0] !== "number" || typeof cursor[1] !== "string"))
  ) {
    return badRequest("cursor غير صالح");
  }

  const after = cursor
    ? { halaqahId: cursor[0] as number, studentId: cursor[1] as string }
    : { halaqahId: 0, studentId: "" };
  const { rows, hasMore } = await listStudentsV1(auth.mosqueId, limit, after);
  const last = rows[rows.length - 1];
  return listResponse(rows, hasMore && last ? encodeCursor([last.halaqah_id, last.id]) : null);
}
