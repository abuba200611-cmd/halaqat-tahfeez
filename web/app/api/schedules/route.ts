import { currentTeacher, unauthorized } from "@/lib/auth";
import { deleteSchedule, getSchedule, listSchedules, saveSchedule } from "@/lib/db";
import { TOTAL_JUZ } from "@/lib/quran";
import type {
  SavedSchedule,
  SavedScheduleDay,
  SavedSchedulePair,
  ScheduleStudent,
} from "@/lib/schedule";

/** يقرأ عدداً صحيحاً ضمن حدّين، أو يرمي خطأ برسالة عربية */
function intInRange(value: unknown, lo: number, hi: number, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < lo || n > hi) {
    throw new Error(`قيمة ${field} غير صحيحة`);
  }
  return n;
}

function parseStudentRef(input: unknown): ScheduleStudent {
  if (typeof input !== "object" || input === null) throw new Error("طالب غير صحيح في الجدول");
  const raw = input as Record<string, unknown>;
  const id = String(raw.id ?? "").trim();
  const name = String(raw.name ?? "").trim();
  if (!id) throw new Error("معرّف طالب مفقود في الجدول");
  if (!name) throw new Error("اسم طالب مفقود في الجدول");
  return { id, name };
}

function parseJuzList(input: unknown): number[] {
  if (!Array.isArray(input)) return [];
  const out: number[] = [];
  for (const entry of input) {
    const juz = Number(entry);
    if (Number.isInteger(juz) && juz >= 1 && juz <= TOTAL_JUZ) out.push(juz);
  }
  return out;
}

function parsePair(input: unknown): SavedSchedulePair {
  if (typeof input !== "object" || input === null) throw new Error("ثنائية غير صحيحة في الجدول");
  const raw = input as Record<string, unknown>;
  return {
    a: parseStudentRef(raw.a),
    b: parseStudentRef(raw.b),
    overlapJuz: parseJuzList(raw.overlapJuz),
  };
}

function parseDay(input: unknown): SavedScheduleDay {
  if (typeof input !== "object" || input === null) throw new Error("يوم غير صحيح في الجدول");
  const raw = input as Record<string, unknown>;

  const date = String(raw.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("تاريخ يوم غير صحيح في الجدول");

  return {
    date,
    dayNumber: intInRange(raw.dayNumber, 1, 31, "رقم اليوم"),
    weekdayName: String(raw.weekdayName ?? "").trim(),
    pairs: (Array.isArray(raw.pairs) ? raw.pairs : []).map(parsePair),
    unmatched: (Array.isArray(raw.unmatched) ? raw.unmatched : []).map(parseStudentRef),
  };
}

/** يتحقق من جدول قادم من العميل ويبني نسخة نظيفة، أو يرمي خطأ برسالة عربية */
function parseSchedule(input: unknown): SavedSchedule {
  if (typeof input !== "object" || input === null) throw new Error("بيانات الجدول غير صحيحة");
  const raw = input as Record<string, unknown>;

  const year = intInRange(raw.year, 2000, 2100, "السنة");
  const month = intInRange(raw.month, 1, 12, "الشهر");

  const weekdays: number[] = [];
  for (const entry of Array.isArray(raw.weekdays) ? raw.weekdays : []) {
    const day = Number(entry);
    if (Number.isInteger(day) && day >= 0 && day <= 6 && !weekdays.includes(day)) {
      weekdays.push(day);
    }
  }
  if (weekdays.length === 0) throw new Error("الجدول بلا أيام حلقة");

  const days = (Array.isArray(raw.days) ? raw.days : []).map(parseDay);
  if (days.length === 0) throw new Error("الجدول بلا أيام");

  const teacherTurns = (Array.isArray(raw.teacherTurns) ? raw.teacherTurns : []).map((entry) => {
    const turn = entry as Record<string, unknown>;
    return {
      student: parseStudentRef(turn.student),
      times: intInRange(turn.times, 0, 366, "عدد مرات التسميع للمعلّم"),
    };
  });

  return {
    year,
    month,
    monthName: String(raw.monthName ?? "").trim(),
    weekdays: weekdays.sort((a, b) => a - b),
    studentCount: intInRange(raw.studentCount, 0, 100000, "عدد الطلاب"),
    sessionCount: days.length,
    candidateCount: intInRange(raw.candidateCount, 0, 100000000, "عدد الثنائيات الممكنة"),
    elapsedMs: intInRange(raw.elapsedMs, 0, 3600000, "زمن التوليد"),
    uniquePairs: intInRange(raw.uniquePairs, 0, 100000000, "عدد الثنائيات المختلفة"),
    maxRepeat: intInRange(raw.maxRepeat, 0, 366, "أكثر تكرار لثنائية"),
    days,
    teacherTurns,
  };
}

/** قائمة الجداول المحفوظة، أو جدول واحد بمحتواه عبر ?id= */
export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const idParam = new URL(request.url).searchParams.get("id");
  if (idParam !== null) {
    const id = Number(idParam);
    if (!Number.isInteger(id)) return Response.json({ error: "معرّف الجدول غير صحيح" }, { status: 400 });

    const record = await getSchedule(teacher.id, id);
    if (!record) return Response.json({ error: "الجدول غير موجود" }, { status: 404 });
    return Response.json({ schedule: record });
  }

  return Response.json({ schedules: await listSchedules(teacher.id) });
}

/** اعتماد جدول شهر وحفظه — يستبدل جدول الشهر نفسه إن وُجد */
export async function POST(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  try {
    const body = (await request.json()) as { schedule?: unknown };
    const schedule = parseSchedule(body.schedule);
    const info = await saveSchedule(
      teacher.id,
      schedule.year,
      schedule.month,
      schedule.weekdays,
      schedule,
    );
    return Response.json({ ok: true, schedule: info });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "تعذّر حفظ الجدول" },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = Number(body.id);
  if (!Number.isInteger(id)) return Response.json({ error: "معرّف الجدول مفقود" }, { status: 400 });

  if (!(await deleteSchedule(teacher.id, id))) {
    return Response.json({ error: "الجدول غير موجود" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
