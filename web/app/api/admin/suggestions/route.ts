import { cookies } from "next/headers";
import { timingSafeEqual } from "node:crypto";
import { listSuggestions } from "@/lib/db";
import { ADMIN_COOKIE } from "../login/route";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export async function GET() {
  const store = await cookies();
  const session = store.get(ADMIN_COOKIE)?.value;
  const expected = process.env.ADMIN_SECRET ?? "";

  if (!expected || !session || !safeEqual(session, expected)) {
    return Response.json({ error: "غير مصرّح" }, { status: 401 });
  }

  return Response.json({ suggestions: await listSuggestions() });
}
