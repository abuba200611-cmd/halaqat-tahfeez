"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card } from "@/components/ui";

/**
 * رابط دعوة ثابت لهذه الحلقة — يشاركه المعلّم مع طلابه (قروب واتساب
 * مثلاً)، وكل من يفتحه وينشئ حسابه بنظام تسجيل الورد ينضم فوراً لهذه
 * الحلقة بلا أي إدخال يدوي (لا إضافة طالب، ولا ربط اسم مستخدم).
 */
type TeamMember = {
  id: number;
  teacherName: string;
  username: string;
  role: "supervisor" | "assistant";
  deactivatedAt: string | null;
};

/** حقل رابط بزر نسخ — نفس الشكل يتكرّر لكل نوع رابط دعوة بالقسم أدناه */
function CopyLinkField({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // بعض المتصفحات تمنع الكتابة للحافظة بلا HTTPS — الرابط ظاهر بالحقل أصلاً
    }
  }

  return (
    <div className="flex gap-2">
      <input
        readOnly
        value={link}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted-foreground"
      />
      <Button onClick={copy} className="shrink-0">
        {copied ? "نُسخ ✓" : "نسخ"}
      </Button>
    </div>
  );
}

/** زر تجديد رابط دعوة الطلاب — مع تأكيد لأنه يُبطل الرابط الحالي فوراً */
function RotateInviteButton({ onRotated }: { onRotated: (link: string) => void }) {
  const [busy, setBusy] = useState(false);

  async function rotate() {
    if (!confirm("تجديد الرابط يُبطل الرابط الحالي — الطلاب الذين لم يسجّلوا بعد سيحتاجون الرابط الجديد. المتابعة؟")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/teacher/invite/rotate", { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { link?: string };
        if (data.link) onRotated(data.link);
      }
    } catch {
      // فشل التجديد لا يغيّر الرابط المعروض — الرابط القديم ما زال صالحاً
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" onClick={rotate} disabled={busy} className="shrink-0">
      {busy ? "…" : "تجديد رابط الدعوة"}
    </Button>
  );
}

/**
 * قسم واحد يجمع كل روابط دعوة الحلقة — بدل ما تكون بطاقات متفرّقة يصعب
 * تمييزها، كل نوع رابط له أيقونة وعنوان واضح يفرّقه عن الثاني فوراً:
 * 🎓 للطلاب (ينضمّون بأنفسهم لتسجيل ورد) مقابل 👥 لمعلّم مساعد (ينضم
 * بصلاحيات مطابقة تماماً لنفس الحلقة).
 */
export function InviteLinksSection() {
  const [studentLink, setStudentLink] = useState<string | null>(null);
  const [teacherLink, setTeacherLink] = useState<string | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  // زر الإيقاف/التفعيل للمشرف فقط — الدور من الخادم (/api/teacher/settings)،
  // لا من أي افتراض بالواجهة
  const [isSupervisor, setIsSupervisor] = useState(false);
  const [busyAssistantId, setBusyAssistantId] = useState<number | null>(null);

  const loadTeam = useCallback(() => {
    fetch("/api/teacher/invite-colleague")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { link?: string; team?: TeamMember[] } | null) => {
        if (data?.link) setTeacherLink(data.link);
        if (data?.team) setTeam(data.team);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/teacher/invite")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { link?: string } | null) => {
        if (data?.link) setStudentLink(data.link);
      })
      .catch(() => {});

    loadTeam();

    fetch("/api/teacher/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { role?: "supervisor" | "assistant" } | null) => {
        if (data?.role) setIsSupervisor(data.role === "supervisor");
      })
      .catch(() => {});
  }, [loadTeam]);

  async function toggleAssistant(member: TeamMember, active: boolean) {
    if (!active) {
      const name = member.teacherName || member.username;
      if (!confirm(`إيقاف ${name} يمنعه من الدخول ويُنهي جلساته فوراً — بياناته وأفعاله السابقة تبقى كما هي. المتابعة؟`)) {
        return;
      }
    }
    setBusyAssistantId(member.id);
    try {
      const res = await fetch(`/api/teacher/assistants/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (res.ok) loadTeam();
    } catch {
      // فشل الطلب يُبقي الحالة المعروضة كما هي — القائمة تُعاد جلبها لاحقاً
    } finally {
      setBusyAssistantId(null);
    }
  }

  if (!studentLink && !teacherLink) return null;

  return (
    <Card className="no-print p-4">
      <h2 className="mb-3 text-sm font-semibold">روابط الدعوة</h2>

      <div className="space-y-4 divide-y divide-border [&>*+*]:pt-4">
        {studentLink && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <span aria-hidden>🎓</span> للطلاب
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              شاركه مع طلابك (بقروب واتساب مثلاً) — كل من يفتحه ويسجّل بحساب جوجل ويكتب اسمه
              ينضم لحلقتك تلقائياً، بلا ما تحتاج تضيفه أو تربطه يدوياً.
            </p>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <CopyLinkField link={studentLink} />
              </div>
              <RotateInviteButton onRotated={setStudentLink} />
            </div>
          </div>
        )}

        {teacherLink && (
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-medium">
              <span aria-hidden>👥</span> لمعلّم مساعد
            </p>
            <p className="mb-2 text-xs text-muted-foreground">
              رابط مختلف تماماً عن رابط الطلاب أعلاه — من يفتحه وينشئ حسابه ينضم كمساعد مشرف
              لنفس حلقتك (يشوف طلابك ويدير كل شيء بصلاحيات مطابقة لك)، بدل ما ينشئ حلقة جديدة.
            </p>
            <CopyLinkField link={teacherLink} />
            {team.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-x-2 gap-y-1.5">
                {team.map((t) => (
                  <li key={t.id} className="flex items-center gap-1.5">
                    <Badge tone={t.role === "supervisor" ? "good" : "neutral"}>
                      {t.teacherName || t.username} — {t.role === "supervisor" ? "مشرف" : "مساعد"}
                    </Badge>
                    {t.deactivatedAt && <Badge tone="warn">موقوف</Badge>}
                    {isSupervisor && t.role === "assistant" && (
                      <button
                        type="button"
                        onClick={() => toggleAssistant(t, t.deactivatedAt === null)}
                        disabled={busyAssistantId === t.id}
                        className={`cursor-pointer rounded px-2 py-1 text-xs transition-colors duration-200 hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 ${
                          t.deactivatedAt ? "text-primary" : "text-destructive"
                        }`}
                      >
                        {busyAssistantId === t.id ? "…" : t.deactivatedAt ? "إعادة تفعيل" : "إيقاف"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
