import { currentTeacher, unauthorized } from "@/lib/auth";
import { listStudents } from "@/lib/db";
import { pageCount, studentJuzes } from "@/lib/pairing";
import { juzLabel } from "@/lib/quran";

function avgMastery(mastery: Record<number, number>): number {
  const vals = Object.values(mastery);
  if (vals.length === 0) return 0;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/** يهرب حقلاً لصيغة CSV: يحيطه بعلامتَي تنصيص لو فيه فاصلة أو سطر أو تنصيص */
function csvField(value: string | number): string {
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) return unauthorized();

  const students = await listStudents(teacher.halaqahId);

  const header = ["الاسم", "المجموعة", "المحفوظ (صفحات)", "النطاق", "الإتقان (٪)", "التقييم", "نشط"];
  const rows = students.map((s) => [
    csvField(s.name),
    csvField(s.group),
    csvField(pageCount(s)),
    csvField(juzLabel(studentJuzes(s))),
    csvField(avgMastery(s.mastery)),
    csvField(s.rating),
    csvField(s.active ? "نعم" : "لا"),
  ]);

  const csv = "﻿" + [header.map(csvField).join(","), ...rows.map((r) => r.join(","))].join("\r\n");

  const today = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="students-${today}.csv"`,
    },
  });
}
