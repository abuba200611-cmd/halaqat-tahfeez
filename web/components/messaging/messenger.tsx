"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ContactOption, ConversationRow, MessageRow } from "@/lib/messaging";

/*
  B2 — مكوّن المراسلة المشترك للأدوار الأربعة (معلّم/طالب/ولي أمر/مدير
  جامع): صندوق وارد بمحادثاته وغير المقروء + عرض محادثة بإرسال وتصفّح
  أقدم + بدء محادثة من جهات الاتصال. الاستقصاء كل ١٥ ثانية وما دامت
  الصفحة ظاهرة (بلا WebSockets)، والدور يُمرَّر لكل مسار كي لا يلتبس على
  جهاز يحمل أكثر من جلسة. الرسائل نص خام فقط — بلا HTML إطلاقاً.
*/

export type MessengerRole = "teacher" | "student" | "parent" | "mosque_admin";

type Inbox = { conversations: ConversationRow[]; unreadTotal: number; contacts: ContactOption[] };

const POLL_MS = 15000;

/** كل نداءات المراسلة تحمل دور المستخدم — لا التباس على جهاز بعدة جلسات */
const apiUrl = (path: string, role: MessengerRole) => `${path}${path.includes("?") ? "&" : "?"}role=${role}`;

/** وقت الرسالة: الساعة لليوم، والتاريخ لما قبله — بأرقام لاتينية كبقية النظام */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = new Intl.DateTimeFormat("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" }).format(date);
  if (sameDay) return time;
  return new Intl.DateTimeFormat("ar-SA-u-nu-latn", { day: "numeric", month: "numeric" }).format(date);
}

export function Messenger({ role }: { role: MessengerRole }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [inboxStatus, setInboxStatus] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [thread, setThread] = useState<{ title: string; messages: MessageRow[]; nextBefore: number | null } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [showContacts, setShowContacts] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedRef = useRef<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  /** أعلى رسالة من غيري اطلعت عليها بالمحادثة المفتوحة — لتعليم المقروء عند الجديد فقط */
  const seenRef = useRef<number>(0);

  const loadInbox = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("/api/messages", role));
      setInboxStatus(res.status);
      if (res.ok) setInbox((await res.json()) as Inbox);
    } catch {
      // نبقي آخر بيانات — الاستقصاء يعيد المحاولة
    }
  }, [role]);

  const markRead = useCallback(async (conversationId: number) => {
    try {
      await fetch(apiUrl(`/api/messages/${conversationId}/read`, role), { method: "POST" });
    } catch {
      // تعليم المقروء أفضل جهد — يعيده الاستقصاء التالي
    }
  }, [role]);

  const loadThread = useCallback(
    async (conversationId: number, older = false) => {
      setThreadLoading(!older);
      try {
        const before = older && thread?.nextBefore ? `&before=${thread.nextBefore}` : "";
        const res = await fetch(apiUrl(`/api/messages/${conversationId}${before}`, role));
        if (!res.ok) {
          if (!older) {
            setSelectedId(null);
            setThread(null);
            setNotice("تعذّر فتح المحادثة.");
          }
          return;
        }
        const data = (await res.json()) as {
          conversation: { title: string };
          messages: MessageRow[];
          nextBefore: number | null;
        };
        setThread((prev) => ({
          title: data.conversation.title,
          messages: older ? [...data.messages, ...(prev?.messages ?? [])] : data.messages,
          nextBefore: data.nextBefore,
        }));
        // رسائل جديدة من الطرف الآخر وأنا فاتح المحادثة = مقروءة الآن
        const incoming = data.messages.filter((m) => !m.fromMe && m.id > seenRef.current);
        if (incoming.length > 0) {
          seenRef.current = Math.max(seenRef.current, ...incoming.map((m) => m.id));
          void markRead(conversationId);
          setInbox((prev) =>
            prev
              ? {
                  ...prev,
                  conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
                  unreadTotal: prev.conversations.reduce(
                    (sum, c) => sum + (c.id === conversationId ? 0 : c.unread),
                    0,
                  ),
                }
              : prev,
          );
        }
      } catch {
        // نبقي ما نعرضه — الاستقصاء يعيد المحاولة
      } finally {
        setThreadLoading(false);
      }
    },
    [markRead, thread?.nextBefore, role],
  );

  // الجلب الأولي + الاستقصاء كل ١٥ ثانية والصفحة ظاهرة (الطرف المفتوح أولى)
  useEffect(() => {
    void loadInbox();
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (selectedRef.current !== null) void loadThread(selectedRef.current);
      else void loadInbox();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [loadInbox, loadThread]);

  // أحدث نسخة من محمّل الطرف — كي لا يعيد فتح المحادثة نفسها كلما تغيّر المؤشر
  const loadThreadRef = useRef(loadThread);
  useEffect(() => {
    loadThreadRef.current = loadThread;
  }, [loadThread]);

  // فتح محادثة: يبدأ من الصفحة الأولى — لا يعاد التحميل إلا بتغيير المحادثة نفسها
  useEffect(() => {
    selectedRef.current = selectedId;
    if (selectedId !== null) {
      seenRef.current = 0;
      setThread(null);
      void loadThreadRef.current(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [thread?.messages.length, selectedId]);

  const openConversation = (conversation: ConversationRow) => {
    setNotice(null);
    setSendError(null);
    setText("");
    setSelectedId(conversation.id);
  };

  async function startContact(contact: ContactOption) {
    setNotice(null);
    try {
      const res = await fetch(apiUrl("/api/messages/start", role), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: contact.kind,
          teacherId: contact.teacherId,
          studentId: contact.studentId,
          parentId: contact.parentId,
          halaqahId: contact.halaqahId,
        }),
      });
      const data = (await res.json().catch(() => null)) as { conversationId?: number; error?: string } | null;
      if (!res.ok || !data?.conversationId) {
        setNotice(data?.error ?? "تعذّر بدء المحادثة");
        return;
      }
      setShowContacts(false);
      setText("");
      setSelectedId(data.conversationId);
      void loadInbox();
    } catch {
      setNotice("تعذّر الاتصال بالخادم");
    }
  }

  async function send() {
    if (selectedId === null) return;
    const body = text.trim();
    if (!body) return;
    setSendError(null);
    try {
      const res = await fetch(apiUrl("/api/messages/send", role), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, body }),
      });
      const data = (await res.json().catch(() => null)) as { message?: MessageRow; error?: string } | null;
      if (!res.ok || !data?.message) {
        setSendError(data?.error ?? "تعذّر الإرسال");
        return;
      }
      const sent = data.message;
      setText("");
      setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, sent] } : prev));
      seenRef.current = Math.max(seenRef.current, sent.id);
      void loadInbox();
    } catch {
      setSendError("تعذّر الاتصال بالخادم");
    }
  }

  const selected = inbox?.conversations.find((c) => c.id === selectedId) ?? null;

  if (inboxStatus === 404) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted-foreground">المراسلة غير مفعّلة لهذا الجامع.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* ————— صندوق الوارد ————— */}
      <section className={`rounded-2xl border border-border bg-surface ${selectedId !== null ? "hidden md:block" : ""}`}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-sm font-bold text-foreground">المحادثات</h2>
          {(inbox?.contacts.length ?? 0) > 0 && (
            <button
              type="button"
              onClick={() => setShowContacts((v) => !v)}
              className="cursor-pointer rounded-lg bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent-ink transition-colors duration-200 hover:bg-accent/30"
            >
              محادثة جديدة
            </button>
          )}
        </div>

        {showContacts && (
          <div className="border-b border-border bg-muted/60 px-2 py-2">
            <p className="px-2 pb-1 text-xs text-muted-foreground">اختر من يجوز لك محادثته:</p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {inbox?.contacts.map((contact) => {
                const existing = inbox.conversations.find(
                  (c) =>
                    c.kind === contact.kind &&
                    c.teacherId === (contact.teacherId ?? null) &&
                    c.studentId === (contact.studentId ?? null) &&
                    c.parentId === (contact.parentId ?? null),
                );
                return (
                  <button
                    key={`${contact.kind}-${contact.teacherId ?? ""}-${contact.studentId ?? ""}-${contact.parentId ?? ""}-${contact.halaqahId ?? ""}`}
                    type="button"
                    onClick={() => startContact(contact)}
                    className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 text-right transition-colors duration-200 hover:bg-accent-soft"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{contact.label}</span>
                      {contact.sub && <span className="block truncate text-xs text-muted-foreground">{contact.sub}</span>}
                    </span>
                    {existing && <span className="shrink-0 text-xs text-accent-ink">مفتوحة</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="max-h-[70vh] overflow-y-auto">
          {inbox === null ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : inbox.conversations.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold text-foreground">لا توجد محادثات بعد</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {inbox.contacts.length > 0 ? "ابدأ أول محادثة من زر «محادثة جديدة»." : "ستظهر هنا محادثاتك عندما تبدأ."}
              </p>
            </div>
          ) : (
            inbox.conversations.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => openConversation(conversation)}
                className={`block w-full cursor-pointer border-b border-border px-4 py-3 text-right transition-colors duration-200 last:border-b-0 hover:bg-muted/60 ${
                  conversation.id === selectedId ? "bg-accent-soft/60" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{conversation.title}</span>
                    {conversation.sub && <span className="block truncate text-xs text-muted-foreground">{conversation.sub}</span>}
                  </span>
                  {conversation.unread > 0 && (
                    <span className="tabular inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold text-on-primary">
                      {conversation.unread}
                    </span>
                  )}
                </div>
                {conversation.lastBody && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {conversation.lastFromMe ? "أنت: " : ""}
                    {conversation.lastBody}
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </section>

      {/* ————— المحادثة المفتوحة ————— */}
      <section className={`flex min-h-[60vh] flex-col rounded-2xl border border-border bg-surface ${selectedId === null ? "hidden md:flex" : "flex"}`}>
        {selectedId === null ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">اختر محادثة لعرضها</p>
            <p className="mt-1 text-xs text-muted-foreground">رسائلك مع المعلّمين وأولياء الأمور والطلاب تظهر هنا.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setThread(null);
                }}
                className="cursor-pointer rounded-lg px-2 py-1 text-sm text-accent-ink transition-colors duration-200 hover:bg-accent-soft md:hidden"
                aria-label="عودة للمحادثات"
              >
                عودة
              </button>
              <div className="min-w-0">
                <h2 className="truncate font-display text-sm font-bold text-foreground">{thread?.title ?? selected?.title ?? ""}</h2>
                {selected?.sub && <p className="truncate text-xs text-muted-foreground">{selected.sub}</p>}
              </div>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
              {threadLoading && !thread && <p className="text-center text-sm text-muted-foreground">جارٍ التحميل…</p>}
              {thread && thread.messages.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">لا رسائل بعد — ابدأ المحادثة بأول رسالة.</p>
              )}
              {thread?.nextBefore !== null && thread?.nextBefore !== undefined && (
                <div className="pb-2 text-center">
                  <button
                    type="button"
                    onClick={() => selectedId !== null && loadThread(selectedId, true)}
                    className="cursor-pointer rounded-lg border border-border px-3 py-1.5 text-xs text-accent-ink transition-colors duration-200 hover:bg-accent-soft"
                  >
                    تحميل الرسائل الأقدم
                  </button>
                </div>
              )}
              {thread?.messages.map((message) => (
                <div key={message.id} className={`flex ${message.fromMe ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                      message.fromMe ? "bg-primary text-on-primary" : "bg-accent-soft text-accent-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <p className={`tabular mt-1 text-[10px] ${message.fromMe ? "text-on-primary/60" : "text-accent-ink/70"}`}>
                      {formatWhen(message.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-border px-4 py-3">
              {sendError && <p className="pb-1 text-xs text-destructive">{sendError}</p>}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="flex items-end gap-2"
              >
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  maxLength={2000}
                  placeholder="اكتب رسالتك…"
                  className="min-h-11 flex-1 resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                />
                <button
                  type="submit"
                  disabled={text.trim().length === 0}
                  className="shrink-0 cursor-pointer rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary transition-colors duration-200 hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  إرسال
                </button>
              </form>
              {text.length > 1800 && (
                <p className="tabular pt-1 text-left text-[10px] text-muted-foreground">{2000 - text.length}</p>
              )}
            </div>
          </>
        )}
      </section>

      {notice && (
        <p className="fixed inset-x-0 bottom-4 mx-auto w-fit max-w-[90vw] rounded-xl bg-primary px-4 py-2 text-sm text-on-primary shadow-lg">
          {notice}
        </p>
      )}
    </div>
  );
}
