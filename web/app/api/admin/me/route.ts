import { isAdmin } from "@/lib/mosque/admin-auth";

export async function GET() {
  return Response.json({ admin: await isAdmin() });
}
