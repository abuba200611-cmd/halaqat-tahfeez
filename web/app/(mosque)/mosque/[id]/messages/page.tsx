"use client";

import { useParams } from "next/navigation";
import { Messenger } from "@/components/messaging/messenger";
import { MosquePage } from "@/components/mosque/mosque-page";

/*
  B2 — رسائل مدير الجامع مع معلّمي جامعه. الصندوق يخصّ مدير الجامع
  (جلسة mosque_admin)؛ المشرف العام لا هوية رسائل له فيرى ردّ «سجّل
  دخولك كمدير جامع» من الخادم بدل محادثات أحد.
*/
export default function MosqueMessagesPage() {
  const params = useParams<{ id: string }>();
  const mosqueId = Number(params.id);
  return (
    <MosquePage mosqueId={mosqueId} activeHref={`/mosque/${mosqueId}/messages`} title="الرسائل">
      <Messenger role="mosque_admin" />
    </MosquePage>
  );
}
