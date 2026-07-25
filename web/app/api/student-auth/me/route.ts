import { currentStudent } from "@/lib/auth";

export async function GET() {
  return Response.json({ student: await currentStudent() });
}
