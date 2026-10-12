"use client";

import { useState } from "react";
import { Button } from "./ui";
import { inputClass } from "./mosque-page";
import { callApi, useApi } from "./use-api";
import type { MosqueMember, PendingStudent } from "@/lib/mosque/db";

type Directory = { students: PendingStudent[]; members: MosqueMember[] };

/**
 * منتقي أفراد الجامع (طلاب + أعضاء أحرار) لإضافتهم لأسرة أو لجنة.
 * يستبعد من هم بالقائمة أصلاً (existing بصيغة "kind:id")، ويتيح إنشاء عضو حر
 * جديد (ولي أمر/متطوع) في المكان نفسه ثم يضيفه مباشرة.
 */
export function MemberPicker({
  mosqueId,
  existing,
  withRole,
  onAdd,
}: {
  mosqueId: number;
  existing: ReadonlySet<string>;
  withRole?: boolean;
  onAdd: (kind: "student" | "member", memberId: number, role: string) => Promise<string | null>;
}) {
  const { data, reload } = useApi<Directory>(`/api/mosques/${mosqueId}/members`);
  const [choice, setChoice] = useState("");
  const [role, setRole] = useState("");
  const [freeName, setFreeName] = useState("");
  const [freePhone, setFreePhone] = useState("");
  const [showFree, setShowFree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const students = data?.students.filter((s) => !existing.has(`student:${s.id}`)) ?? [];
  const members = data?.members.filter((m) => !existing.has(`member:${m.id}`)) ?? [];

  async function add(kind: "student" | "member", memberId: number) {
    const failure = await onAdd(kind, memberId, role.trim());
    if (failure) {
      setError(failure);
      return false;
    }
    setRole("");
    return true;
  }

  async function addChosen() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    const [kind, rawId] = choice.split(":");
    if (await add(kind as "student" | "member", Number(rawId))) setChoice("");
    setBusy(false);
  }

  async function addFree(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const created = await callApi<{ member: MosqueMember }>(`/api/mosques/${mosqueId}/members`, "POST", {
      name: freeName,
      phone: freePhone,
    });
    if (!created.ok || !created.data) {
      setError(created.error);
      setBusy(false);
      return;
    }
    if (await add("member", created.data.member.id)) {
      setFreeName("");
      setFreePhone("");
      setShowFree(false);
    }
    reload();
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          aria-label="اختيار فرد"
          className={`${inputClass} sm:flex-1`}
        >
          <option value="">اختر فرداً من الجامع…</option>
          {students.length > 0 && (
            <optgroup label="الطلاب">
              {students.map((s) => (
                <option key={`s${s.id}`} value={`student:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          )}
          {members.length > 0 && (
            <optgroup label="أعضاء آخرون">
              {members.map((m) => (
                <option key={`m${m.id}`} value={`member:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {withRole && (
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={50}
            placeholder="الدور (رئيس/عضو…)"
            aria-label="الدور"
            className={`${inputClass} sm:w-44`}
          />
        )}
        <Button type="button" onClick={addChosen} disabled={busy || !choice}>
          إضافة
        </Button>
      </div>

      {showFree ? (
        <form onSubmit={addFree} className="flex flex-col gap-2 rounded-xl bg-muted p-3 sm:flex-row">
          <input
            value={freeName}
            onChange={(e) => setFreeName(e.target.value)}
            maxLength={100}
            required
            placeholder="اسم ولي الأمر/المتطوع"
            aria-label="اسم العضو الجديد"
            className={`${inputClass} sm:flex-1`}
          />
          <input
            value={freePhone}
            onChange={(e) => setFreePhone(e.target.value)}
            maxLength={30}
            placeholder="الجوال (اختياري)"
            aria-label="جوال العضو الجديد"
            className={`${inputClass} sm:w-40`}
          />
          <Button type="submit" disabled={busy || !freeName.trim()}>
            إنشاء وإضافة
          </Button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowFree(true)}
          className="cursor-pointer text-xs text-primary hover:underline"
        >
          + عضو جديد ليس طالباً (ولي أمر، متطوع…)
        </button>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
