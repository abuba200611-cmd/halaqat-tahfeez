import { authenticateV1, badRequest, decodeCursor, encodeCursor, listResponse, parseLimit } from "@/lib/api-v1";
import { listHalaqatV1 } from "@/lib/api-v1-db";

/** GET /api/v1/halaqat — حلقات جامع المفتاح (نطاق halaqat:read) */
export async function GET(request: Request) {
  const auth = await authenticateV1(request, "halaqat:read");
  if (auth instanceof Response) return auth;

  const query = new URL(request.url).searchParams;
  const limit = parseLimit(query.get("limit"));
  if (limit === null) return badRequest("limit بين 1 و200");
  const cursor = decodeCursor(query.get("cursor"));
  if (cursor === "invalid" || (cursor && (cursor.length !== 1 || typeof cursor[0] !== "number"))) {
    return badRequest("cursor غير صالح");
  }

  const { rows, hasMore } = await listHalaqatV1(auth.mosqueId, limit, cursor ? (cursor[0] as number) : 0);
  const last = rows[rows.length - 1];
  return listResponse(rows, hasMore && last ? encodeCursor([last.id]) : null);
}
