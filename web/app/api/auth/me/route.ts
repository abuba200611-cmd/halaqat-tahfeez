import { currentTeacher } from "@/lib/auth";

export async function GET() {
  return Response.json({ teacher: await currentTeacher() });
}
