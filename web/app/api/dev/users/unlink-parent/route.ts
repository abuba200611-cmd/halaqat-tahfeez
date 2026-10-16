import { devConsoleGate } from "@/lib/dev-gate";
import { unlinkParentFromStudent } from "@/lib/parent-db";
import { logDevAction } from "@/lib/dev-audit";

/** فكّ ربط ولي أمر عن طالب — نفس دالة النظام القائمة بلا ازدواج */
export async function POST(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    parentId?: unknown;
    halaqahId?: unknown;
    studentId?: unknown;
  };
  const parentId = Number(body.parentId);
  const halaqahId = Number(body.halaqahId);
  const studentId = String(body.studentId ?? "");
  if (!Number.isInteger(parentId) || !Number.isInteger(halaqahId) || !studentId) {
    return Response.json({ error: "بيانات ناقصة" }, { status: 400 });
  }

  const unlinked = await unlinkParentFromStudent(halaqahId, studentId, parentId);
  if (!unlinked) return Response.json({ error: "لا يوجد ربط بهذه البيانات" }, { status: 404 });

  await logDevAction("unlink_parent", "parent", parentId, { halaqahId, studentId, via: "dev-console" });
  return Response.json({ ok: true });
}
