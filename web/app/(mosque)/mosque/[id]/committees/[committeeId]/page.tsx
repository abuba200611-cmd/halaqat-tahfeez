"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage, inputClass } from "@/components/mosque/mosque-page";
import { MemberPicker } from "@/components/mosque/member-picker";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { Committee, CommitteeMember, CommitteeTask, TaskStatus } from "@/lib/mosque/db";

type Detail = { committee: Committee; members: CommitteeMember[]; tasks: CommitteeTask[] };

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "todo", label: "للتنفيذ" },
  { status: "doing", label: "قيد التنفيذ" },
  { status: "done", label: "منجزة" },
];

/** لجنة واحدة: أعضاؤها بأدوارهم + لوحة مهام بثلاثة أعمدة تتغير حالتها بالأزرار */
export default function CommitteePage() {
  const params = useParams<{ id: string; committeeId: string }>();
  const mosqueId = Number(params.id);
  const committeeId = Number(params.committeeId);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/committees/${committeeId}`} title="اللجنة">
      <CommitteeDetail mosqueId={mosqueId} committeeId={committeeId} />
    </MosquePage>
  );
}

function CommitteeDetail({ mosqueId, committeeId }: { mosqueId: number; committeeId: number }) {
  const router = useRouter();
  const base = `/api/mosques/${mosqueId}/committees/${committeeId}`;
  const { data, status, loading, reload } = useApi<Detail>(base);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return status === 404 ? (
      <Empty
        title="اللجنة غير موجودة أو الميزة غير مفعّلة."
        action={
          <Link href={`/mosque/${mosqueId}/committees`} className="text-sm text-accent-ink hover:underline">
            العودة للجان
          </Link>
        }
      />
    ) : (
      <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="اللجان" />
    );
  }

  const existing = new Set(data.members.map((m) => `${m.memberKind}:${m.memberId}`));

  async function addMember(kind: "student" | "member", memberId: number, role: string) {
    const result = await callApi(`${base}/members`, "POST", { memberKind: kind, memberId, role });
    if (!result.ok) return result.error;
    reload();
    return null;
  }

  async function removeMember(member: CommitteeMember) {
    setError(null);
    const result = await callApi(`${base}/members/${member.memberId}?kind=${member.memberKind}`, "DELETE");
    if (!result.ok) setError(result.error);
    reload();
  }

  async function removeCommittee() {
    if (!window.confirm(`حذف «${data!.committee.name}»؟ تُحذف أعضاؤها ومهامها ولا يمكن التراجع.`)) return;
    const result = await callApi(base, "DELETE");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/mosque/${mosqueId}/committees`);
  }

  return (
    <div className="space-y-5">
      <Link href={`/mosque/${mosqueId}/committees`} className="text-sm text-accent-ink hover:underline">
        ← كل اللجان
      </Link>

      <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <h2 className="font-display text-xl font-bold">{data.committee.name}</h2>
          {data.committee.description && <p className="mt-1 text-sm text-muted-foreground">{data.committee.description}</p>}
        </div>
        <Button variant="danger" onClick={removeCommittee}>
          حذف اللجنة
        </Button>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">الأعضاء</h3>
          <Badge>{data.members.length}</Badge>
        </div>
        {data.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا أعضاء بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.members.map((member) => (
              <li key={`${member.memberKind}:${member.memberId}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  {member.name}
                  {member.role && <span className="ms-2 text-xs font-medium text-primary">{member.role}</span>}
                </span>
                <Button variant="danger" onClick={() => removeMember(member)}>
                  إزالة
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border pt-4">
          <MemberPicker mosqueId={mosqueId} existing={existing} withRole onAdd={addMember} />
        </div>
      </Card>

      <TaskBoard base={base} tasks={data.tasks} onChange={reload} onError={setError} />
    </div>
  );
}

function TaskBoard({
  base,
  tasks,
  onChange,
  onError,
}: {
  base: string;
  tasks: CommitteeTask[];
  onChange: () => void;
  onError: (message: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    onError(null);
    const result = await callApi(`${base}/tasks`, "POST", { title, dueDate });
    setBusy(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setTitle("");
    setDueDate("");
    onChange();
  }

  async function move(task: CommitteeTask, status: TaskStatus) {
    onError(null);
    const result = await callApi(`${base}/tasks/${task.id}`, "PATCH", { status });
    if (!result.ok) onError(result.error);
    onChange();
  }

  async function remove(task: CommitteeTask) {
    onError(null);
    const result = await callApi(`${base}/tasks/${task.id}`, "DELETE");
    if (!result.ok) onError(result.error);
    onChange();
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">المهام</h3>
      <Card className="p-4">
        <form onSubmit={addTask} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
            placeholder="مهمة جديدة…"
            aria-label="عنوان المهمة"
            className={`${inputClass} sm:flex-1`}
          />
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            aria-label="تاريخ الاستحقاق"
            className={`${inputClass} sm:w-44`}
          />
          <Button type="submit" disabled={busy || !title.trim()}>
            إضافة
          </Button>
        </form>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {COLUMNS.map((column) => {
          const items = tasks.filter((task) => task.status === column.status);
          return (
            <div key={column.status} className="rounded-2xl bg-muted/60 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">{column.label}</p>
                <Badge>{items.length}</Badge>
              </div>
              <div className="space-y-2">
                {items.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">لا مهام</p>}
                {items.map((task) => (
                  <Card key={task.id} className="space-y-2 p-3">
                    <p className="text-sm">{task.title}</p>
                    {task.dueDate && <p className="tabular text-xs text-muted-foreground">الاستحقاق: {task.dueDate}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {COLUMNS.filter((c) => c.status !== task.status).map((c) => (
                        <Button key={c.status} variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => move(task, c.status)}>
                          إلى «{c.label}»
                        </Button>
                      ))}
                      <Button variant="danger" className="!px-3 !py-1 text-xs" onClick={() => remove(task)}>
                        حذف
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
