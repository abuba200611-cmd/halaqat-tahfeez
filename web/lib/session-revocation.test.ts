import { createHmac } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  اختبار إبطال الجلسات بنسخة الجلسة (الدفعة الأمنية ب) — نحاكي قاعدة
  البيانات وnext/headers بالكامل: الجلسة كلها تُقرأ وتُكتب من "جرة"
  كوابس وهمية نتحكم بها، فنثبت أن رفع النسخة يُسقط الجلسات القديمة وأن
  الرموز القديمة (بلا نسخة) تُعامل كنسخة ٠ فلا يُخرج أحد.
*/

const jar = vi.hoisted(() => ({} as Record<string, string | undefined>));
const sqlMock = vi.hoisted(() => vi.fn());

vi.mock("@netlify/database", () => ({
  getDatabase: () => ({ sql: sqlMock }),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (jar[name] ? { name, value: jar[name]! } : undefined),
    set: (name: string, value: string) => {
      jar[name] = value;
    },
    delete: (name: string) => {
      delete jar[name];
    },
  })),
}));

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-not-for-production";
});

const { createSessionToken, currentTeacher, currentStudent, setSessionCookie, setStudentSessionCookie } = await import(
  "./auth"
);
const { bumpTeacherSessionVersion, rotateHalaqahInviteCode } = await import("./db");

const TEACHER_ROW = (sessionVersion: number) => [
  {
    id: 42,
    username: "t@example.com",
    password_hash: "x",
    teacher_name: "معلّم",
    halaqah_id: 7,
    halaqah_name: "الحلقة",
    role: "supervisor",
    email_verified: true,
    session_version: sessionVersion,
  },
];

const STUDENT_ROW = (sessionVersion: number) => [
  { id: "s1", name: "طالب", halaqah_name: "الحلقة", session_version: sessionVersion },
];

function sqlTextOf(call: unknown): string {
  return ((call as unknown[])[0] as TemplateStringsArray).join("").trim();
}

beforeEach(() => {
  sqlMock.mockReset();
  for (const key of Object.keys(jar)) delete jar[key];
});

describe("إبطال جلسة المعلّم بنسخة الجلسة", () => {
  it("رمز صحيح بنسخة مطابقة لقاعدة البيانات → جلسة صالحة", async () => {
    jar.halaqa_session = await createSessionToken(42, 1);
    sqlMock.mockResolvedValueOnce(TEACHER_ROW(1));

    const teacher = await currentTeacher();
    expect(teacher?.id).toBe(42);
    expect(teacher?.sessionVersion).toBe(1);
  });

  it("عدم تطابق النسخة (بعد تغيير كلمة المرور أو إنهاء الجلسات) → غير موثّق", async () => {
    jar.halaqa_session = await createSessionToken(42, 1);
    sqlMock.mockResolvedValueOnce(TEACHER_ROW(2));

    expect(await currentTeacher()).toBeNull();
  });

  it("رمز قديم بلا نسخة (نسخة ٠) مع حساب نسخته ٠ → مقبول، لا يُخرج مستخدمي اليوم", async () => {
    const payload = `42.${Date.now()}`;
    const signature = createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("hex");
    jar.halaqa_session = `${payload}.${signature}`;
    sqlMock.mockResolvedValueOnce(TEACHER_ROW(0));

    expect((await currentTeacher())?.id).toBe(42);
  });

  it("bumpTeacherSessionVersion يزيد العمود — كل رموز النسخة السابقة تسقط", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await bumpTeacherSessionVersion(42);
    expect(sqlTextOf(sqlMock.mock.calls[0])).toContain("session_version = session_version + 1");
  });

  it("إصدار رمز جديد يضمّن نسخة الجلسة الحالية من قاعدة البيانات", async () => {
    sqlMock.mockResolvedValueOnce([{ session_version: 5 }]);
    await setSessionCookie(42);

    const { readSessionToken } = await import("./auth");
    expect(await readSessionToken(jar.halaqa_session!)).toEqual({ teacherId: 42, sessionVersion: 5 });
  });
});

describe("إبطال جلسة الطالب بنسخة الجلسة", () => {
  it("رمز صحيح بنسخة مطابقة → جلسة صالحة، وعدم التطابق → غير موثّق", async () => {
    const { createStudentSessionToken } = await import("./auth");

    jar.halaqa_student = await createStudentSessionToken(7, "s1", 0);
    sqlMock.mockResolvedValueOnce(STUDENT_ROW(0));
    expect((await currentStudent())?.id).toBe("s1");

    jar.halaqa_student = await createStudentSessionToken(7, "s1", 0);
    sqlMock.mockResolvedValueOnce(STUDENT_ROW(1));
    expect(await currentStudent()).toBeNull();
  });

  it("إصدار رمز طالب جديد يضمّن نسخة جلسته الحالية", async () => {
    sqlMock.mockResolvedValueOnce([{ session_version: 2 }]);
    await setStudentSessionCookie(7, "s1");

    const { readStudentSessionToken } = await import("./auth");
    expect(await readStudentSessionToken(jar.halaqa_student!)).toEqual({
      teacherId: 7,
      studentId: "s1",
      sessionVersion: 2,
    });
  });
});

describe("تدوير رمز دعوة الطلاب", () => {
  it("يستبدل invite_code نفسه — مصدر الحقيقة الوحيد، فالرمز القديم يبطل فوراً", async () => {
    sqlMock.mockResolvedValueOnce([]);
    await rotateHalaqahInviteCode(7);
    const text = sqlTextOf(sqlMock.mock.calls[0]);
    expect(text).toContain("UPDATE halaqahs SET invite_code =");
    expect(text).not.toContain("teacher_invite_code");
  });
});
