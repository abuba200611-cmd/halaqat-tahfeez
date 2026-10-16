import { devConsoleGate } from "@/lib/dev-gate";
import { bumpParentSessionVersion, bumpStudentSessionVersion } from "@/lib/dev-db";
import { bumpTeacherSessionVersion } from "@/lib/db";
import { logDevAction } from "@/lib/dev-audit";

/**
 * إبطال كل جلسات حساب (معلّم/طالب/ولي أمر) برفع نسخة الجلسة — تسقط
 * فوراً على كل الأجهزة بنفس آلية "إنهاء كل الجلسات" القائمة.
 */
export async function POST(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    teacherId?: unknown;
    halaqahId?: unknown;
    studentId?: unknown;
    parentId?: unknown;
  };

  if (body.kind === "teacher") {
    const teacherId = Number(body.teacherId);
    if (!Number.isInteger(teacherId)) return Response.json({ error: "معرّف غير صحيح" }, { status: 400 });
    await bumpTeacherSessionVersion(teacherId);
    await logDevAction("revoke_sessions", "teacher", teacherId, { via: "dev-console" });
    return Response.json({ ok: true });
  }

  if (body.kind === "student") {
    const halaqahId = Number(body.halaqahId);
    const studentId = String(body.studentId ?? "");
    if (!Number.isInteger(halaqahId) || !studentId) {
      return Response.json({ error: "معرّف غير صحيح" }, { status: 400 });
    }
    await bumpStudentSessionVersion(halaqahId, studentId);
    await logDevAction("revoke_sessions", "student", `${halaqahId}/${studentId}`, { via: "dev-console" });
    return Response.json({ ok: true });
  }

  if (body.kind === "parent") {
    const parentId = Number(body.parentId);
    if (!Number.isInteger(parentId)) return Response.json({ error: "معرّف غير صحيح" }, { status: 400 });
    await bumpParentSessionVersion(parentId);
    await logDevAction("revoke_sessions", "parent", parentId, { via: "dev-console" });
    return Response.json({ ok: true });
  }

  return Response.json({ error: "نوع حساب غير معروف" }, { status: 400 });
}
