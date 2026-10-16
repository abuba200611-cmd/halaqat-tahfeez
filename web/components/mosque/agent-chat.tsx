"use client";

import { useEffect, useRef, useState } from "react";
import { Badge, Button, Card } from "@/components/mosque/ui";
import { BrainIcon } from "@/components/mosque/icons";
import { callApi } from "@/components/mosque/use-api";

/*
  لوحة محادثة مساعد MOS داخل لوحة الجامع — عربية RTL، غير متدفقة. أدوات
  الكتابة تظهر هنا كبطاقات مقترحات، ولا ينفَّذ منها شيء إلا بضغط المدير
  «نفّذ» (و«إلغاء» للرفض). غياب مفتاح المزوّد يظهر «المساعد غير مفعّل بعد».
*/

type Proposal = {
  id: number;
  kind: string;
  status: "pending" | "approved" | "rejected" | "failed";
  title: string;
  summary: string;
  createdAt: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

const STATUS_BADGE: Record<Proposal["status"], { label: string; tone: "good" | "warn" | "neutral" }> = {
  pending: { label: "بانتظار قرارك", tone: "warn" },
  approved: { label: "نُفِّذ ✓", tone: "good" },
  rejected: { label: "أُلغي", tone: "neutral" },
  failed: { label: "تعذّر التنفيذ", tone: "warn" },
};

export function AgentChatPanel({ mosqueId }: { mosqueId: number }) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`/api/mosques/${mosqueId}/agent`)
      .then(async (res) => (res.ok ? res.json() : { available: null }))
      .then((d: { available: boolean | null; proposals?: Proposal[] }) => {
        setAvailable(d.available);
        if (d.proposals) setProposals(d.proposals);
      })
      .catch(() => setAvailable(null));
  }, [mosqueId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, proposals, busy]);

  function mergeProposals(incoming: Proposal[]) {
    setProposals((current) => {
      const byId = new Map(current.map((proposal) => [proposal.id, proposal]));
      for (const proposal of incoming) byId.set(proposal.id, proposal);
      return [...byId.values()].sort((a, b) => b.id - a.id);
    });
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const content = input.trim();
    if (!content || busy || available === false) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await callApi<{ reply: string; proposals: Proposal[] }>(
        `/api/mosques/${mosqueId}/agent/chat`,
        "POST",
        { messages: nextMessages },
      );
      if (!result.ok || !result.data) {
        setError(result.error ?? "تعذّر الرد الآن");
        return;
      }
      setMessages([...nextMessages, { role: "assistant", content: result.data.reply }]);
      mergeProposals(result.data.proposals ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function decide(proposalId: number, action: "execute" | "cancel") {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await callApi<{ proposal: Proposal; message: string | null }>(
        `/api/mosques/${mosqueId}/agent/proposals/${proposalId}`,
        "POST",
        { action },
      );
      if (!result.ok || !result.data) {
        setError(result.error ?? "تعذّر الحسم");
        return;
      }
      mergeProposals([result.data.proposal]);
      setNotice(result.data.message);
    } finally {
      setBusy(false);
    }
  }

  const pendingProposals = proposals.filter((proposal) => proposal.status === "pending");

  return (
    <Card className="flex flex-col p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BrainIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">مساعد MOS</p>
          <p className="text-xs text-muted-foreground">اسأل عن أي شيء ببيانات جامعك — التعديلات تُنفَّذ بموافقتك فقط.</p>
        </div>
      </div>

      {available === false ? (
        <div className="rounded-xl border border-border bg-muted/40 px-3 py-6 text-center">
          <p className="text-sm font-semibold">المساعد غير مفعّل بعد</p>
          <p className="mt-1 text-xs text-muted-foreground">ينتظر ضبط مفتاح المزوّد من مالك المنصة، ثم يعمل فوراً.</p>
        </div>
      ) : (
        <>
          <div ref={listRef} className="mb-3 max-h-96 space-y-3 overflow-y-auto pl-1">
            {messages.length === 0 && !busy && (
              <p className="py-4 text-center text-xs text-muted-foreground">
                جرّب: «كم طالباً بانتظار التوزيع؟» أو «فعّل ميزة الأوسمة» أو «لخّص لي تقرير هذا الأسبوع».
              </p>
            )}
            {messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === "user" ? "justify-start" : "justify-end"}`}>
                <div
                  className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${
                    message.role === "user" ? "bg-primary text-on-primary" : "border border-border bg-muted/40"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {busy && <p className="text-xs text-muted-foreground">المساعد يفكّر…</p>}
          </div>

          {pendingProposals.length > 0 && (
            <div className="mb-3 space-y-2">
              {pendingProposals.map((proposal) => (
                <div key={proposal.id} className="rounded-xl border border-border bg-surface p-3">
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold">{proposal.title}</p>
                    <Badge tone={STATUS_BADGE[proposal.status].tone}>{STATUS_BADGE[proposal.status].label}</Badge>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">{proposal.summary}</p>
                  <div className="flex gap-2">
                    <Button onClick={() => decide(proposal.id, "execute")} disabled={busy}>
                      نفّذ
                    </Button>
                    <Button variant="ghost" onClick={() => decide(proposal.id, "cancel")} disabled={busy}>
                      إلغاء
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {decidedList(proposals).length > 0 && (
            <details className="mb-3">
              <summary className="cursor-pointer text-xs text-muted-foreground">مقترحات سابقة ({decidedList(proposals).length})</summary>
              <ul className="mt-2 space-y-1">
                {decidedList(proposals).map((proposal) => (
                  <li key={proposal.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2 py-1.5">
                    <span className="min-w-0 truncate text-xs">{proposal.title}</span>
                    <Badge tone={STATUS_BADGE[proposal.status].tone}>{STATUS_BADGE[proposal.status].label}</Badge>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
          {notice && <p className="mb-2 text-sm text-success">{notice}</p>}

          <form onSubmit={send} className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="اكتب سؤالك للمساعد…"
              disabled={busy}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
            />
            <Button type="submit" disabled={busy || !input.trim()} className="shrink-0">
              {busy ? "…" : "إرسال"}
            </Button>
          </form>
        </>
      )}
    </Card>
  );
}

function decidedList(proposals: Proposal[]): Proposal[] {
  return proposals.filter((proposal) => proposal.status !== "pending");
}
