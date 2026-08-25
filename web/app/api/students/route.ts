import { currentTeacher, unauthorized } from "@/lib/auth";
import { deleteStudent, listStudents, replaceStudents, upsertStudent } from "@/lib/db";
import { TOTAL_JUZ, TOTAL_PAGES } from "@/lib/quran";
import type { MemorizedRange, Student } from "@/lib/types";

/** يتحقق من طالب قادم من العميل ويرجع نسخة نظيفة، أو يرمي خطأ برسالة عربية */
function parseStudent(input: unknown): Student {
  if (typeof input !== "object" || input === null) throw new Error("بيانات الطالب غير صحيحة");
  const raw = input as Record<string, unknown>;

  const id = String(raw.id ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id) throw new Error("معرّف الطالب مفقود");
  if (!name) throw new Error("اسم الطالب مطلوب");

  const ranges: MemorizedRange[] = (Array.isArray(raw.ranges) ? raw.ranges : []).map((entry) => {
    const range = entry as Record<string, unknown>;
    const from = Number(range.from);
    const to = Number(range.to);
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      throw new Error(`نطاق حفظ غير صحيح للطالب ${name}`);
    }
    if (from < 1 || to > TOTAL_PAGES || from > to) {
      throw new Error(`نطاق حفظ خارج حدود المصحف للطالب ${name}`);
    }
    const monthsAgo = Number(range.monthsAgo);
    return { from, to, monthsAgo: Number.isFinite(monthsAgo) ? monthsAgo : 0 };
  });

  const mastery: Record<number, number> = {};
  const rawMastery = (raw.mastery ?? {}) as Record<string, unknown>;
  for (const [key, value] of Object.entries(rawMastery)) {
    const juz = Number(key);
    const score = Number(value);
    if (!Number.isInteger(juz) || juz < 1 || juz > TOTAL_JUZ) continue;
    if (!Number.isFinite(score)) continue;
    mastery[juz] = Math.min(100, Math.max(0, score));
  }

  const ratingNum = Number(raw.rating);
  const rating = Number.isInteger(ratingNum) ? Math.min(5, Math.max(0, ratingNum)) : 0;

  return {
    id,
    name,
    group: String(raw.group ?? "").trim(),
    ranges,
    mastery,
    active: raw.active !== false,
    rating,
  };
}

export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  return Response.json({ students: await listStudents(teacher.halaqahId) });
}

/** إضافة طالب أو تعديله */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  try {
    const body = (await request.json()) as { student?: unknown };
    await upsertStudent(teacher.halaqahId, parseStudent(body.student));
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر حفظ الطالب" },
      { status: 400 },
    );
  }
}

/** استبدال القائمة كاملة — للحلقة التجريبية ولمسح البيانات */
export async function PUT(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  try {
    const body = (await request.json()) as { students?: unknown };
    if (!Array.isArray(body.students)) throw new Error("قائمة الطلاب مفقودة");

    await replaceStudents(teacher.halaqahId, body.students.map(parseStudent));
    return Response.json({ ok: true, count: body.students.length });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر حفظ القائمة" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = String(body.id ?? "").trim();
  if (!id) return Response.json({ error: "معرّف الطالب مفقود" }, { status: 400 });

  if (!(await deleteStudent(teacher.halaqahId, id))) {
    return Response.json({ error: "الطالب غير موجود" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
