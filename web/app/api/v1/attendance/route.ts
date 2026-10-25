import {
  DATE_RE,
  authenticateV1,
  badRequest,
  decodeCursor,
  encodeCursor,
  listResponse,
  parseLimit,
} from "@/lib/api-v1";
import { listAttendanceV1 } from "@/lib/api-v1-db";

/** GET /api/v1/attendance?from=&to=&halaqah_id= — حضور جامع المفتاح (نطاق attendance:read) */
export async function GET(request: Request) {
  const auth = await authenticateV1(request, "attendance:read");
  if (auth instanceof Response) return auth;

  const query = new URL(request.url).searchParams;
  const limit = parseLimit(query.get("limit"));
  if (limit === null) return badRequest("limit بين 1 و200");
  const cursor = decodeCursor(query.get("cursor"));
  if (
    cursor === "invalid" ||
    (cursor &&
      (cursor.length !== 3 ||
        typeof cursor[0] !== "number" ||
        typeof cursor[1] !== "string" ||
        typeof cursor[2] !== "string"))
  ) {
    return badRequest("cursor غير صالح");
  }

  const from = query.get("from");
  const to = query.get("to");
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) return badRequest("التاريخ بصيغة YYYY-MM-DD");
  const halaqahRaw = query.get("halaqah_id");
  if (halaqahRaw && !/^[0-9]{1,9}$/.test(halaqahRaw)) return badRequest("halaqah_id غير صالح");

  const after = cursor
    ? { halaqahId: cursor[0] as number, studentId: cursor[1] as string, date: cursor[2] as string }
    : { halaqahId: 0, studentId: "", date: "" };
  const { rows, hasMore } = await listAttendanceV1(auth.mosqueId, limit, after, {
    from: from || null,
    to: to || null,
    halaqahId: halaqahRaw ? Number(halaqahRaw) : null,
  });
  const last = rows[rows.length - 1];
  return listResponse(rows, hasMore && last ? encodeCursor([last.halaqah_id, last.student_id, last.date]) : null);
}
