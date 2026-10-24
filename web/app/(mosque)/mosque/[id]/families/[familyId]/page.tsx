"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/mosque/ui";
import { ApiState, MosquePage } from "@/components/mosque/mosque-page";
import { MemberPicker } from "@/components/mosque/member-picker";
import { callApi, useApi } from "@/components/mosque/use-api";
import type { Family, FamilyMember } from "@/lib/mosque/db";

/** أسرة واحدة: أفرادها (إضافة/إزالة) وحذف الأسرة */
export default function FamilyPage() {
  const params = useParams<{ id: string; familyId: string }>();
  const mosqueId = Number(params.id);
  const familyId = Number(params.familyId);

  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/families/${familyId}`} title="الأسرة">
      <FamilyDetail mosqueId={mosqueId} familyId={familyId} />
    </MosquePage>
  );
}

function FamilyDetail({ mosqueId, familyId }: { mosqueId: number; familyId: number }) {
  const router = useRouter();
  const base = `/api/mosques/${mosqueId}/families/${familyId}`;
  const { data, status, loading, reload } = useApi<{ family: Family; members: FamilyMember[] }>(base);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    return status === 404 ? (
      <Empty
        title="الأسرة غير موجودة أو الميزة غير مفعّلة."
        action={
          <Link href={`/mosque/${mosqueId}/families`} className="text-sm text-accent-ink hover:underline">
            العودة للأسر
          </Link>
        }
      />
    ) : (
      <ApiState loading={loading} status={status} mosqueId={mosqueId} featureName="الأسر" />
    );
  }

  const existing = new Set(data.members.map((m) => `${m.memberKind}:${m.memberId}`));

  async function addMember(kind: "student" | "member", memberId: number) {
    const result = await callApi(`${base}/members`, "POST", { memberKind: kind, memberId });
    if (!result.ok) return result.error;
    reload();
    return null;
  }

  async function removeMember(member: FamilyMember) {
    setError(null);
    const result = await callApi(`${base}/members/${member.memberId}?kind=${member.memberKind}`, "DELETE");
    if (!result.ok) setError(result.error);
    reload();
  }

  async function removeFamily() {
    if (!window.confirm(`حذف أسرة «${data!.family.name}»؟ لا يمكن التراجع، وتُحذف درجاتها الأسبوعية.`)) return;
    const result = await callApi(base, "DELETE");
    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.push(`/mosque/${mosqueId}/families`);
  }

  return (
    <div className="space-y-5">
      <Link href={`/mosque/${mosqueId}/families`} className="text-sm text-accent-ink hover:underline">
        ← كل الأسر
      </Link>

      <Card className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <h2 className="font-display text-xl font-bold">{data.family.name}</h2>
          {data.family.leaderName && (
            <p className="mt-1 text-sm text-muted-foreground">رئيس الأسرة: {data.family.leaderName}</p>
          )}
          {data.family.notes && <p className="mt-2 text-sm">{data.family.notes}</p>}
        </div>
        <Button variant="danger" onClick={removeFamily}>
          حذف الأسرة
        </Button>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">الأفراد</h3>
          <Badge>{data.members.length}</Badge>
        </div>

        {data.members.length === 0 ? (
          <p className="text-sm text-muted-foreground">لا أفراد بعد.</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.members.map((member) => (
              <li key={`${member.memberKind}:${member.memberId}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm">
                  {member.name}
                  <span className="ms-2 text-xs text-muted-foreground">
                    {member.memberKind === "student" ? "طالب" : "عضو"}
                  </span>
                </span>
                <Button variant="danger" onClick={() => removeMember(member)}>
                  إزالة
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-border pt-4">
          <MemberPicker mosqueId={mosqueId} existing={existing} onAdd={addMember} />
        </div>
      </Card>
    </div>
  );
}
